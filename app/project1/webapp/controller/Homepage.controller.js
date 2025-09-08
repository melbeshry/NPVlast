sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function(Controller, JSONModel) {
    "use strict";

    return Controller.extend("project1.controller.Homepage", {
        onInit: function() {
            var oTabModel = new JSONModel({ selectedKey: "sales" });
            this.getView().setModel(oTabModel, "tabBar");
        
            var oUser = this.getOwnerComponent().getModel("user").getData() || { id: "", roles: [] };
            var aRoles = oUser.roles || [];
            var sUserId = oUser.id || "unknown";
        
            var oConfigTab = this.getView().byId("_IDGenIconTabFilter");
            var oSalesTab = this.getView().byId("_IDGenIconTabFilter1");
        
            if (oConfigTab) {
                oConfigTab.setVisible(aRoles.includes("ConfigAdmin"));
            }
            if (oSalesTab) {
                oSalesTab.setVisible(aRoles.includes("SalesAdmin"));
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