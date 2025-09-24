sap.ui.define([
    "sap/ui/core/UIComponent",
    "project1/model/models",
    "sap/ui/model/json/JSONModel"
], (UIComponent, models, JSONModel) => {
    "use strict";

    return UIComponent.extend("project1.Component", {
        metadata: {
            manifest: "json",
            interfaces: ["sap.ui.core.IAsyncContentCreation"]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // default fallback user
            let oUserData = {
                id: "unknown",
                roles: []
            };

            // build relative URL (works in Managed Work Zone)
            const sAppPath = window.location.pathname.split("/")[1]; // the prefix
            const sUserApiUrl = `/${sAppPath}/user-api/currentUser`;

            fetch(sUserApiUrl, {
                credentials: "include" // important for xsuaa session
            })
            .then(async response => {
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // map scopes to roles
                const aRoles = [];
                if (data.scopes && Array.isArray(data.scopes)) {
                    if (data.scopes.some(s => s.includes("ConfigAdmin"))) aRoles.push("ConfigAdmin");
                    if (data.scopes.some(s => s.includes("SalesAdmin"))) aRoles.push("SalesAdmin");
                }

                oUserData = {
                    id: data.email || data.id || "unknown",
                    roles: aRoles,
                    firstname: data.firstname,
                    lastname: data.lastname,
                    displayName: data.displayName
                };

                console.log("User Info loaded: ", oUserData);

                const oUserModel = new JSONModel(oUserData);
                this.setModel(oUserModel, "user");
            })
            .catch(err => {
                console.error("Error fetching user: ", err);
                const oDefaultEnv = this.getDefaultEnv();
                if (oDefaultEnv && oDefaultEnv.USER) {
                    oUserData = oDefaultEnv.USER;
                }
                const oUserModel = new JSONModel(oUserData);
                this.setModel(oUserModel, "user");
            });
            oUserData = {
                id: "moataz.elbeshry@solex-tech.com", // Default user ID
                roles: ["ConfigAdmin", "SalesAdmin"] // Default roles (overridden by default-env if present)
            };
            // initialize routing
            this.getRouter().initialize();
        },

        getDefaultEnv: function() {
            return window.__CAP_DEFAULT_ENV__ || {};
        }
    });
});
