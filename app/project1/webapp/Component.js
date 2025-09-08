sap.ui.define([
    "sap/ui/core/UIComponent",
    "project1/model/models",
    "sap/ui/model/json/JSONModel"
], (UIComponent, models, JSONModel) => {
    "use strict";

    return UIComponent.extend("project1.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // Call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // Set the device model
            this.setModel(models.createDeviceModel(), "device");

            // Initialize the user model with roles and id from default-env.json
            var oUserData = {
                id: "moataz.elbeshry@solex-tech.com", // Default user ID
                roles: ["ConfigAdmin", "SalesAdmin"] // Default roles (overridden by default-env if present)
            };

            // Try to get USER data from default-env.json via CAP runtime
            try {
                var oDefaultEnv = this.getDefaultEnv();
                if (oDefaultEnv && oDefaultEnv.USER) {
                    oUserData = oDefaultEnv.USER;
                }
            } catch (e) {
                console.log("Error reading default-env.json:", e);
            }

            // Log the user data for debugging
            console.log("Current User:", oUserData);

            // Set the user model
            var oUserModel = new JSONModel(oUserData);
            this.setModel(oUserModel, "user");

            // Enable routing
            this.getRouter().initialize();
        },

        // Helper method to access default-env.json
        getDefaultEnv: function() {
            return window.__CAP_DEFAULT_ENV__ || require("@sap/cds").env;
        }
    });
});