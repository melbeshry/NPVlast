sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function(Controller, JSONModel) {
    "use strict";

    return Controller.extend("project1.controller.Homepage", {
        onInit: function() {
            var oTabModel = new JSONModel({ selectedKey: "sales", visible: true });
            this.getView().setModel(oTabModel, "tabBar");
            
            var oUser = this.getOwnerComponent().getModel("user").getData() || { id: "", roles: [] };
            var aRoles = oUser.roles || [];
            var sUserId = oUser.id || "unknown";
            
            var oConfigTab = this.getView().byId("_IDGenIconTabFilter");
            var oSalesTab = this.getView().byId("_IDGenIconTabFilter1");

            // Check if user has any authorized role
            var bHasAccess = aRoles.includes("ConfigAdmin") || aRoles.includes("SalesAdmin");

            if (!bHasAccess) {
                // Hide entire tab bar if no roles assigned
                this.getView().setVisible(false);
                console.warn("User has no roles, hiding homepage view");
                return;
            }

            if (oConfigTab) {
                oConfigTab.setVisible(aRoles.includes("ConfigAdmin"));
            }
            if (oSalesTab) {
                oSalesTab.setVisible(aRoles.includes("SalesAdmin"));
            }
            
            // Set initial tab based on authorization
            if (aRoles.includes("ConfigAdmin") && !aRoles.includes("SalesAdmin")) {
                oTabModel.setProperty("/selectedKey", "config");
            } else if (aRoles.includes("SalesAdmin")) {
                oTabModel.setProperty("/selectedKey", "sales");
            }
            
            console.log("Current User ID:", sUserId);
            console.log("User Roles:", aRoles);
        },

        onTabSelect: function(oEvent) {
            var sKey = oEvent.getParameter("key");
            this.getView().getModel("tabBar").setProperty("/selectedKey", sKey);
        }
    });
});
