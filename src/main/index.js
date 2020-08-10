import { app, BrowserWindow, ipcMain, dialog, Menu } from "electron";
import { BlobServiceClient } from "@azure/storage-blob";
import { readFileSync } from "fs";
import { zip } from "zip-a-folder";
import { resolve } from "path";
const axios = require("axios");
const Store = require("electron-store");
const YAML = require("yamljs");

const store = new Store();

/**
 * Set `__static` path to static files in production
 * https://simulatedgreg.gitbooks.io/electron-vue/content/en/using-static-assets.html
 */
if (process.env.NODE_ENV !== "development") {
  global.__static = require("path")
    .join(__dirname, "/static")
    .replace(/\\/g, "\\\\");
}

let mainWindow;
const winURL =
  process.env.NODE_ENV === "development"
    ? `http://localhost:9080`
    : `file://${__dirname}/index.html`;

function createWindow() {
  /**
   * Initial window options
   */
  mainWindow = new BrowserWindow({
    height: 563,
    useContentSize: true,
    width: 1000,
  });

  mainWindow.loadURL(winURL);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  // Create the Application's main menu
  const template = [
    {
      label: "Application",
      submenu: [
        {
          label: "About Application",
          selector: "orderFrontStandardAboutPanel:",
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "Command+Q",
          click: function() {
            app.quit();
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
        { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
        { type: "separator" },
        { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
        { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
        { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
        {
          label: "Select All",
          accelerator: "CmdOrCtrl+A",
          selector: "selectAll:",
        },
      ],
    },
  ];
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }
}

const checkForUpdates = async (event) => {
  const platform = process.platform;
  let suffix = "";
  switch (platform) {
    case "darwin":
      suffix = "-mac";
      break;
    case "linux":
      suffix = "-linux";
      break;
  }
  const baseUrl =
    "https://github.com/maxoyed/amc-client/releases/latest/download";
  const latestUrl = `${baseUrl}/latest${suffix}.yml`;
  const ymlString = (await axios.get(latestUrl)).data;
  const yml = YAML.parse(ymlString);
  const latestVersion = yml.version;
  const fileUrl = yml.files[0].url;
  const downloadUrl = `${baseUrl}/${fileUrl}`;
  const appVersion = process.env.npm_package_version;
  if (latestVersion != appVersion) {
    event.sender.send("check-for-updates-res", { latestVersion, downloadUrl });
  } else {
    console.log("Already Updated");
  }
  console.log("latestVersion: ", latestVersion);
  console.log("appVersion: ", appVersion);
};

app.on("ready", createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// ipc
ipcMain.on("get-initial-config", (event, args) => {
  const res = {
    connection_string: store.get("connection_string") || "",
    container_name: store.get("container_name") || "",
    url: store.get("url") || "",
    webhook: store.get("webhook") || "",
  };
  event.sender.send("initial-config", res);
});
ipcMain.on("check-for-updates", (event, args) => {
  checkForUpdates(event);
});
ipcMain.on("update-config", (event, args) => {
  store.set("connection_string", args.connection_string);
  store.set("container_name", args.container_name);
  store.set("url", args.url);
  store.set("webhook", args.webhook);
  const res = {
    connection_string: store.get("connection_string"),
    container_name: store.get("container_name"),
    url: store.get("url"),
    webhook: store.get("webhook"),
  };
  event.sender.send("config-updated", res);
});
ipcMain.on("select-folder", async (event, args) => {
  const res = dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  console.log("res: ", res);
  event.sender.send("folder-selected", res);
  if (res) {
    let filename = "";
    let parentDir = "";
    if (res[0].split("\\").length === 1) {
      filename = res[0].split("/").pop() + ".zip";
      parentDir = res[0].split("/");
    } else {
      filename = res[0].split("\\").pop() + ".zip";
      parentDir = res[0].split("\\");
    }
    parentDir.pop();
    const compressedFilePath = resolve(parentDir.join("\\"), filename);
    await zip(res[0], compressedFilePath);

    console.log("compressedFilePath", compressedFilePath);
    event.sender.send("folder-compressed", compressedFilePath);
  }
});
ipcMain.on("select-file", (event, args) => {
  const res = dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      {
        name: "Compressed File",
        extensions: ["zip", "gz", "rar", "7z", "tar"],
      },
    ],
  });
  console.log(res);
  event.sender.send("file-selected", res);
});
ipcMain.on("upload", async (event, selectedFile) => {
  const AZURE_STORAGE_CONNECTION_STRING = store.get("connection_string") || "";
  const containerName = store.get("container_name") || "";

  const blobServiceClient = BlobServiceClient.fromConnectionString(
    AZURE_STORAGE_CONNECTION_STRING
  );
  const containerClient = blobServiceClient.getContainerClient(containerName);
  console.log(selectedFile);
  let blobName = "";
  if (selectedFile.split("\\").length === 1) {
    blobName = selectedFile.split("/").pop();
  } else {
    blobName = selectedFile.split("\\").pop();
  }
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  const data = readFileSync(selectedFile);
  try {
    const uploadBlobResponse = await blockBlobClient.upload(data, data.length);
    const blobUrl = `${store.get("url")}/${store.get(
      "container_name"
    )}/${blobName}`;
    const requestId = uploadBlobResponse.requestId;
    // console.log("uploadBlobResponse: ", uploadBlobResponse);
    event.sender.send("upload-finished", { requestId, blobUrl });
    const webhook = store.get("webhook");
    if (webhook) {
      const res = await axios.post(webhook, { blobUrl });
      console.log("webhook response: ", res.data);
    } else {
      console.info("wehbook config not found");
    }
  } catch (error) {
    console.log("upload fail: ", error);
    // const err_msg = {
    //   msg: error.details.message,
    //   code: error.details.Code,
    // };
    event.sender.send("upload-failed");
  }
});

/**
 * Auto Updater
 *
 * Uncomment the following code below and install `electron-updater` to
 * support auto updating. Code Signing with a valid certificate is required.
 * https://simulatedgreg.gitbooks.io/electron-vue/content/en/using-electron-builder.html#auto-updating
 */

/*
import { autoUpdater } from 'electron-updater'

autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall()
})

app.on('ready', () => {
  if (process.env.NODE_ENV === 'production') autoUpdater.checkForUpdates()
})
 */
