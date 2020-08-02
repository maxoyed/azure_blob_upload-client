import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { BlobServiceClient } from "@azure/storage-blob";
import { readFileSync } from "fs";
import { zip } from "zip-a-folder";
import { resolve } from "path";
const Store = require("electron-store");

const store = new Store();

let AZURE_STORAGE_CONNECTION_STRING = store.get("connection_string") || "";
let containerName = store.get("container_name") || "test";
store.set("connection_string", AZURE_STORAGE_CONNECTION_STRING);
store.set("container_name", containerName);
let blobServiceClient = BlobServiceClient.fromConnectionString(
  AZURE_STORAGE_CONNECTION_STRING
);
let containerClient = blobServiceClient.getContainerClient(containerName);

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
}

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
    connection_string: AZURE_STORAGE_CONNECTION_STRING,
    container_name: containerName,
  };
  event.sender.send("initial-config", res);
});
ipcMain.on("update-config", (event, args) => {
  store.set("connection_string", args.connection_string);
  store.set("container_name", args.container_name);
  const res = {
    connection_string: store.get("connection_string"),
    container_name: store.get("container_name"),
  };
  AZURE_STORAGE_CONNECTION_STRING =
    store.get("connection_string") ||
    "BlobEndpoint=https://zzh.blob.core.windows.net/;QueueEndpoint=https://zzh.queue.core.windows.net/;FileEndpoint=https://zzh.file.core.windows.net/;TableEndpoint=https://zzh.table.core.windows.net/;SharedAccessSignature=sv=2019-12-12&ss=bfqt&srt=co&sp=rwdlacupx&se=2020-08-02T17:57:38Z&st=2020-08-02T09:57:38Z&spr=https&sig=FwW6GlcHbwLN9Y0sszAuC96y53vlVYypFqpNoIzPcis%3D";
  containerName = store.get("container_name") || "test";
  blobServiceClient = BlobServiceClient.fromConnectionString(
    AZURE_STORAGE_CONNECTION_STRING
  );
  containerClient = blobServiceClient.getContainerClient(containerName);
  event.sender.send("config-updated", res);
});
ipcMain.on("select-folder", async (event, args) => {
  const res = dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  console.log(res);
  event.sender.send("folder-selected", res);
  if (res) {
    const filename = res[0].split("\\").pop() + ".zip";
    const parentDir = res[0].split("\\");
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
  console.log(selectedFile);
  const blobName = selectedFile.split("\\").pop();
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  const data = readFileSync(selectedFile);
  const uploadBlobResponse = await blockBlobClient.upload(data, data.length);
  event.sender.send("upload-finished", uploadBlobResponse.requestId);
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
