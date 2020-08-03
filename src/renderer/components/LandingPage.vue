<template>
  <div id="wrapper">
    <section class="action">
      <b-button
        @click="selectFolder"
        type="is-primary"
        rounded
        outlined
        icon-left="folder"
        class="action_item"
        :loading="compressing"
        >Select Folder</b-button
      >
      <b-button
        @click="selectFile"
        type="is-primary"
        rounded
        outlined
        icon-left="zip-box"
        class="action_item"
        >Select Archive File</b-button
      >
      <b-button
        @click="clearSelection"
        type="is-danger"
        icon-left="delete"
        class="action_item"
      ></b-button>
      <b-button
        @click="isComponentModalActive = true"
        type="is-primary"
        icon-left="cog"
        class="action_item"
      ></b-button>
    </section>
    <section class="file-info">
      <p v-if="selectedFile">
        {{ selectedFile }}
      </p>
    </section>
    <section class="upload">
      <b-button
        v-if="selectedFile && !compressing"
        rounded
        type="is-success"
        icon-left="upload"
        outlined
        :loading="uploadStart"
        @click="upload"
        :disabled="uploadStart"
      >
        Upload
      </b-button>
    </section>
    <section v-if="err_msg" class="err-msg">
      Upload Failed
      <p>Code: {{ err_msg.code }}</p>
      <p>Message: {{ err_msg.msg }}</p>
    </section>
    <b-modal
      :active.sync="isComponentModalActive"
      has-modal-card
      trap-focus
      :destroy-on-hide="false"
      aria-role="dialog"
      aria-modal
    >
      <modal-form v-bind="config"></modal-form>
    </b-modal>
  </div>
</template>

<script>
const ModalForm = {
  props: ["connection_string", "container_name"],
  methods: {
    updateConfig() {
      const config = {
        connection_string: this.connection_string,
        container_name: this.container_name,
      };
      this.$electron.ipcRenderer.send("update-config", config);
      this.$parent.close();
    },
  },
  template: `
            <form>
                <div class="modal-card" style="width: 500">
                    <header class="modal-card-head">
                        <p class="modal-card-title">Connection Config</p>
                    </header>
                    <section class="modal-card-body">
                        <b-field label="Connection String">
                            <b-input
                                type="text"
                                v-model="connection_string"
                                placeholder="Your Connection String"
                                required>
                            </b-input>
                        </b-field>

                        <b-field label="Container Name">
                            <b-input
                                type="text"
                                v-model="container_name"
                                placeholder="Your Container Name"
                                required>
                            </b-input>
                        </b-field>
                    </section>
                    <footer class="modal-card-foot">
                        <button class="button" type="button" @click="$parent.close()">Cancel</button>
                        <button class="button is-primary" type="button" @click="updateConfig">Update</button>
                    </footer>
                </div>
            </form>
        `,
};
export default {
  name: "landing-page",
  components: {
    ModalForm,
  },
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
      isComponentModalActive: false,
      err_msg: false,
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
        this.compressing = true;
      }
    });
    this.$electron.ipcRenderer.on("folder-compressed", (event, data) => {
      console.log(data);
      this.selectedFile = data;
      this.compressing = false;
    });
    this.$electron.ipcRenderer.on("upload-finished", (event, requestId) => {
      this.$buefy.notification.open({
        duration: 5000,
        message: `Blob was uploaded successfully.`,
        position: "is-bottom-right",
        type: "is-success",
      });
      this.uploadStart = false;
      this.requestId = requestId;
    });
    this.$electron.ipcRenderer.on("upload-failed", (event, err_msg) => {
      console.log("Upload Failed");
      this.uploadStart = false;
      this.err_msg = err_msg;
    });
    this.$electron.ipcRenderer.on("initial-config", (event, initialConfig) => {
      console.log("initial config: ", initialConfig);
      this.config = initialConfig;
    });
    this.$electron.ipcRenderer.on("config-updated", (event, config) => {
      console.log("config updated: ", config);
      this.$buefy.notification.open({
        duration: 3000,
        message: `Config updated successfully.`,
        position: "is-bottom-right",
        type: "is-success",
      });
      this.config = config;
    });
  },
  methods: {
    selectFile() {
      this.requestId = false;
      this.err_msg = false;
      this.$electron.ipcRenderer.send("select-file");
    },
    selectFolder() {
      this.requestId = false;
      this.err_msg = false;
      this.$electron.ipcRenderer.send("select-folder");
    },
    clearSelection() {
      this.selectedFile = false;
      this.requestId = false;
      this.err_msg = false;
      this.uploadStart = false;
      this.compressing = false;
    },
    upload() {
      this.err_msg = false;
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
  height: 100vh;
  width: 100vw;
  padding: 2em 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
}
section {
  height: 15%;
}
.config {
  display: flex;
  justify-content: space-around;
  align-items: flex-end;
}
.upload {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.upload p {
  margin-top: 0.5em;
}
.action_item {
  margin-right: 1em;
}
</style>
