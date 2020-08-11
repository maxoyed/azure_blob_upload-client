import { app, BrowserWindow, ipcMain, dialog, Menu } from "electron";
import { BlobServiceClient } from "@azure/storage-blob";
import { readFileSync, stat } from "fs";
import { zip } from "zip-a-folder";
import { resolve } from "path";
const axios = require("axios");
const Store = require("electron-store");
const YAML = require("yamljs");
const path = require("path");
import { AbortController } from "@azure/abort-controller";

const packageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, "..", "..", "package.json"))
);

const store = new Store();
const appVersion = packageJson.version;

let controller = new AbortController();

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
  if (latestVersion > appVersion) {
    event.sender.send("check-for-updates-res", { latestVersion, downloadUrl });
  } else {
    console.log("Already Updated");
  }
  console.log("latestVersion: ", latestVersion);
  console.log("appVersion: ", appVersion);
};

const getFileSize = (filePath) => {
  return new Promise((resolve, reject) => {
    stat(filePath, (err, stats) => {
      if (err) {
        reject(err);
      } else {
        resolve(stats.size);
      }
    });
  });
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
    AZURE_STORAGE_CONNECTION_STRING,
    {
      retryOptions: {
        maxTries: 10,
        retryPolicyType: 1,
        tryTimeoutInMs: 0,
      },
    }
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
  const totalSize = await getFileSize(selectedFile);
  console.log("file size: ", totalSize);
  controller = new AbortController();
  const abortSignal = controller.signal;
  try {
    const uploadBlobResponse = await blockBlobClient.uploadFile(selectedFile, {
      blockSize: 4 * 1024 * 1024,
      concurrency: 5,
      abortSignal,
      onProgress: (ev) => {
        const progress = {
          loadedBytes: ev.loadedBytes,
          totalSize,
        };
        mainWindow.setProgressBar(ev.loadedBytes / totalSize);
        event.sender.send("upload-progress", progress);
      },
    });
    const blobUrl = `${store.get("url")}/${store.get(
      "container_name"
    )}/${blobName}`;
    const requestId = uploadBlobResponse.requestId;
    console.log("uploadBlobResponse: ", uploadBlobResponse);
    event.sender.send("upload-finished", { requestId, blobUrl });
    const webhook = store.get("webhook");
    if (webhook) {
      const res = await axios.post(webhook, { blobUrl });
      console.log("webhook response: ", res.data);
    } else {
      console.info("wehbook config not found");
    }
  } catch (error) {
    console.log("error name: ", error.name);
    if (error.hasOwnProperty("request")) {
      console.warn("webhook url cannot be visit");
    } else if (error.name === "AbortError") {
      console.log("Operation was aborted by the user");
    } else {
      console.log("upload fail: ", error);
      event.sender.send("upload-failed");
    }
  }
  mainWindow.setProgressBar(-1);
});
ipcMain.on("abort", async (event, args) => {
  controller.abort();
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
