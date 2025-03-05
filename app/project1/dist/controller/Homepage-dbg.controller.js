sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function(Controller, JSONModel) {
    "use strict";

    return Controller.extend("project1.controller.Homepage", {
        onInit: function() {
            var oTabModel = new JSONModel({ selectedKey: "sales" });
            this.getView().setModel(oTabModel, "tabBar");
        },

        onTabSelect: function(oEvent) {
            var sKey = oEvent.getParameter("key");
            this.getView().getModel("tabBar").setProperty("/selectedKey", sKey);
        }
    });
});