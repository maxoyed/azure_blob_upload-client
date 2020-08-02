<template>
  <div id="wrapper">
    <div class="config">
      <div style="display: inline-block">
        <label for="connection_string">Connection String: </label>
        <input
          type="text"
          name="connection_string"
          v-model="config.connection_string"
        />
      </div>
      <div style="display: inline-block">
        <label for="container_name">Container Name: </label>
        <input
          type="text"
          name="container_name"
          v-model="config.container_name"
        />
      </div>
      <button @click="updateConfig">Update Config</button>
    </div>
    <button @click="selectFolder">Select Folder</button>
    <button @click="selectFile">Select Archive File</button>
    <button @click="clearSelection">Clear</button>
    <p v-if="selectedFile">
      {{ selectedFile }}
    </p>
    <p v-if="compressing">
      Compressing...
    </p>
    <button
      v-if="selectedFile && !compressing"
      @click="upload"
      :disabled="uploadStart"
    >
      Upload
    </button>
    <p v-if="uploadStart">Uploading...</p>
    <p v-if="requestId">
      Blob was uploaded successfully. requestId: {{ requestId }}
    </p>
  </div>
</template>

<script>
export default {
  name: "landing-page",
  data() {
    return {
      selectedFile: false,
      uploadStart: false,
      requestId: false,
      compressing: false,
      config: {
        connection_string: false,
        container_name: false,
      },
    };
  },
  mounted() {
    this.$electron.ipcRenderer.send("get-initial-config");
    this.$electron.ipcRenderer.on("file-selected", (event, data) => {
      console.log(data);
      if (data) {
        this.selectedFile = data[0];
      }
    });
    this.$electron.ipcRenderer.on("folder-selected", (event, data) => {
      console.log(data);
      if (data) {
        this.selectedFile = data[0];
      }
    });
    this.$electron.ipcRenderer.on("folder-compressed", (event, data) => {
      console.log(data);
      this.selectedFile = data;
      this.compressing = false;
    });
    this.$electron.ipcRenderer.on("upload-finished", (event, requestId) => {
      console.log("Blob was uploaded successfully. requestId: ", requestId);
      this.uploadStart = false;
      this.requestId = requestId;
    });
    this.$electron.ipcRenderer.on("initial-config", (event, initialConfig) => {
      console.log("initial config: ", initialConfig);
      this.config = initialConfig;
    });
    this.$electron.ipcRenderer.on("config-updated", (event, config) => {
      console.log("config updated: ", config);
      this.config = config;
    });
  },
  methods: {
    updateConfig() {
      this.$electron.ipcRenderer.send("update-config", this.config);
    },
    selectFile() {
      this.requestId = false;
      this.$electron.ipcRenderer.send("select-file");
    },
    selectFolder() {
      this.requestId = false;
      this.compressing = true;
      this.$electron.ipcRenderer.send("select-folder");
    },
    clearSelection() {
      this.selectedFile = false;
      this.requestId = false;
    },
    upload() {
      this.$electron.ipcRenderer.send("upload", this.selectedFile);
      this.uploadStart = true;
    },
  },
};
</script>

<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

#wrapper {
  background: radial-gradient(
    ellipse at top left,
    rgba(255, 255, 255, 1) 40%,
    rgba(229, 229, 229, 0.9) 100%
  );
  height: 100vh;
  padding: 60px;
  width: 100vw;
}

#logo {
  height: auto;
  margin-bottom: 20px;
  width: 420px;
}

main {
  display: flex;
  justify-content: space-between;
}

main > div {
  flex-basis: 50%;
}

.left-side {
  display: flex;
  flex-direction: column;
}

.welcome {
  color: #555;
  font-size: 23px;
  margin-bottom: 10px;
}

.title {
  color: #2c3e50;
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 6px;
}

.title.alt {
  font-size: 18px;
  margin-bottom: 10px;
}
</style>
