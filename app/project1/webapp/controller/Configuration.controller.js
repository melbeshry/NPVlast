sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/Column",
    "sap/m/Text",
    "sap/m/Input",
    "sap/m/MessageToast"
  ], function(Controller, JSONModel, Column, Text, Input, MessageToast) {
    "use strict";
  
    return Controller.extend("project1.controller.Configuration", {
  
        onInit: function() {
            var oConfigModel = new JSONModel({
                frequency: "Annual"
            });
            this.getView().setModel(oConfigModel, "config");
  
            var oPeriodsData = {};
            oPeriodsData["First 4 Months"] = Array(20).fill().map(() => ({ value: "" }));
            for (var i = 1; i <= 20; i++) {
                var sKey = i + "YP";
                oPeriodsData[sKey] = Array(20).fill().map(() => ({ value: "" }));
            }
  
            var oPeriodsModel = new JSONModel(oPeriodsData);
            console.log("Initial Periods Model:", JSON.stringify(oPeriodsModel.getData(), null, 2));
            oPeriodsModel.setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
            this.getView().setModel(oPeriodsModel, "periods");
  
            var oODataModel = this.getOwnerComponent().getModel("npvModel");
            this._loadDataFromOData(oODataModel, oConfigModel, oPeriodsModel)
                .then(() => {
                    this._createPeriodTable();
                })
                .catch((error) => {
                    console.error("Failed to load data:", error);
                });
        },
  
        _createPeriodTable: function() {
            var oTable = this.byId("periodsTable");
            var oPeriodsModel = this.getView().getModel("periods");
            var oData = oPeriodsModel.getData();
  
            oTable.removeAllColumns();
            oTable.unbindItems();
  
            var MAX_YP = 20;
  
            oTable.addColumn(new Column({
                header: new Text({ text: "Period Name" })
            }));
  
            for (var i = 1; i <= MAX_YP; i++) {
                oTable.addColumn(new Column({
                    header: new Text({ text: i + "YP" })
                }));
            }
  
            oTable.bindItems({
                path: "periods>/",
                factory: function(sId, oContext) {
                    var sPeriodKey = oContext.getPath().split("/").pop();
                    var aCells = [];
  
                    aCells.push(new Text({ text: sPeriodKey }));
  
                    for (var colIndex = 1; colIndex <= MAX_YP; colIndex++) {
                        if (sPeriodKey === "First 4 Months") {
                            var idxF4M = colIndex - 1;
                            aCells.push(new Input({
                                value: "{periods>/" + sPeriodKey + "/" + idxF4M + "/value}",
                                type: "Number",
                                change: this._onInputChange.bind(this)
                            }));
                        } else {
                            var n = parseInt(sPeriodKey.replace("YP", ""), 10);
                            if (!isNaN(n) && colIndex >= n) {
                                var arrayIndex = colIndex - n;
                                aCells.push(new Input({
                                    value: "{periods>/" + sPeriodKey + "/" + arrayIndex + "/value}",
                                    type: "Number",
                                    change: this._onInputChange.bind(this)
                                }));
                            } else {
                                aCells.push(new Text({ text: "" }));
                            }
                        }
                    }
  
                    return new sap.m.ColumnListItem({ cells: aCells });
                }.bind(this)
            });
        },
  
        _onInputChange: function(oEvent) {
            var oInput = oEvent.getSource();
            var sValue = oInput.getValue().trim();
            var sPath = oInput.getBinding("value").getPath();
            var sFullPath = "/periods" + sPath;
            var oModel = this.getView().getModel("periods");
  
            console.log("Full Path:", sFullPath, "New Value:", sValue, "Current Model Value:", oModel.getProperty(sFullPath));
  
            if (sValue === "") {
                // Two-way binding will handle this
                return;
            }
  
            var fValue = parseFloat(sValue);
            if (isNaN(fValue) || fValue < 0 || fValue > 100) {
                oInput.setValueState("Error");
                oInput.setValueStateText("Please enter a valid number between 0 and 100.");
                MessageToast.show("Please enter a valid number between 0 and 100.");
                // Let user correct it; don't revert manually
            } else {
                oInput.setValueState("None"); // Clear any error state
                // Two-way binding updates the model automatically
            }
        },
  
        _loadDataFromOData: function(oODataModel, oConfigModel, oPeriodsModel) {
            if (!oODataModel) {
                console.warn("OData model not found; skipping load");
                return Promise.resolve();
            }
  
            return oODataModel.bindList("/Configurations", undefined, undefined, undefined, {
                $expand: "periods($expand=percentages)"
            }).requestContexts().then(function(aContexts) {
                if (aContexts.length > 0) {
                    var oConfig = aContexts[0].getObject();
                    oConfigModel.setData({
                        frequency: oConfig.frequency,
                        lastUpdatedBy: oConfig.lastUpdatedBy || "Unknown"
                    });
  
                    var defaultData = oPeriodsModel.getData();
                    var mergedData = { ...defaultData };
                    if (oConfig.periods) {
                        var aPeriods = oConfig.periods.results || oConfig.periods;
                        aPeriods.forEach(function(period) {
                            var sPeriodName = period.periodName;
                            var aPercentages = period.percentages.results || period.percentages;
                            mergedData[sPeriodName] = Array(20).fill().map((_, idx) => ({
                                value: aPercentages[idx] && aPercentages[idx].value != null 
                                    ? aPercentages[idx].value.toString() 
                                    : ""
                            }));
                        });
                    }
                    oPeriodsModel.setData(mergedData);
                    console.log("Merged Periods Model:", JSON.stringify(mergedData, null, 2));
                } else {
                    console.log("No Configurations found; using defaults.");
                }
            });
        },
  
        onSave: function() {
            var oPeriodsModel = this.getView().getModel("periods");
            var oConfigModel = this.getView().getModel("config");
            if (!oPeriodsModel || !oConfigModel) {
                console.error("Required models not found.");
                return;
            }
        
            var oPeriodsData = oPeriodsModel.getData();
            for (var periodName in oPeriodsData) {
                var total = 0;
                oPeriodsData[periodName].forEach(function(obj) {
                    var val = parseFloat(obj.value) || 0;
                    total += val;
                });
                if (total > 100) {
                    MessageToast.show(
                        `Total for ${periodName} exceeds 100% (${total.toFixed(2)}%). Please correct.`
                    );
                    return;
                }
            }
        
            var oConfigData = oConfigModel.getData();
            var aPeriodsPayload = Object.keys(oPeriodsData).map(function(periodName) {
                return {
                    periodName: periodName,
                    percentages: oPeriodsData[periodName].map(function(obj, idx) {
                        return {
                            index: idx,
                            value: parseFloat(obj.value) || 0
                        };
                    })
                };
            });
        
            var oPayload = {
                frequency: oConfigData.frequency,
                periods: aPeriodsPayload
            };
            console.log("Payload:", JSON.stringify(oPayload, null, 2));
        
            var oODataModel = this.getOwnerComponent().getModel("npvModel");
            if (!oODataModel) {
                console.error("OData model not found.");
                MessageToast.show("Error: OData model not available");
                return;
            }
        
            // Check if a configuration exists
            oODataModel.bindList("/Configurations").requestContexts().then(function(aContexts) {
                if (aContexts.length > 0) {
                    // Update existing configuration
                    var oContext = aContexts[0]; // Get the context of the first configuration
                    var sConfigId = oContext.getObject().ID;
        
                    // Bind to the specific entity and get the context
                    var oBinding = oODataModel.bindContext(`/Configurations(${sConfigId})`);
                    oBinding.requestObject().then(function(oEntityData) {
                        // Update the frequency property
                        oBinding.getBoundContext().setProperty("frequency", oPayload.frequency);
        
                        // Handle nested periods
                        var oPeriodsBinding = oODataModel.bindList(`/Configurations(${sConfigId})/periods`);
                        oPeriodsBinding.requestContexts().then(function(aPeriodContexts) {
                            // Delete existing periods
                            aPeriodContexts.forEach(function(oPeriodContext) {
                                oPeriodContext.delete();
                            });
        
                            // Create new periods
                            oPayload.periods.forEach(function(period) {
                                oPeriodsBinding.create({
                                    periodName: period.periodName,
                                    percentages: period.percentages
                                });
                            });
        
                            // Submit all changes
                            oODataModel.submitBatch("updateGroup").then(function() {
                                MessageToast.show("Data updated successfully!");
                                console.log("Update successful");
                            }).catch(function(oError) {
                                console.error("Error updating data:", oError);
                                MessageToast.show("Failed to update data: " + oError.message);
                            });
                        }).catch(function(oError) {
                            console.error("Error managing periods:", oError);
                            MessageToast.show("Failed to manage periods: " + oError.message);
                        });
                    }).catch(function(oError) {
                        console.error("Error fetching entity data:", oError);
                        MessageToast.show("Failed to fetch entity data: " + oError.message);
                    });
                } else {
                    // Create new configuration
                    oODataModel.bindList("/Configurations").create(oPayload, {
                        success: function() {
                            MessageToast.show("Data saved successfully!");
                            console.log("Create successful");
                        },
                        error: function(oError) {
                            console.error("Error saving data:", oError);
                            MessageToast.show("Failed to save data: " + oError.message);
                        }
                    });
        
                    // Submit the batch for creation
                    oODataModel.submitBatch("updateGroup").then(function() {
                        console.log("Batch submitted for creation");
                    }).catch(function(oError) {
                        console.error("Batch submission failed:", oError);
                        MessageToast.show("Failed to submit batch: " + oError.message);
                    });
                }
            }).catch(function(oError) {
                console.error("Error checking existing configurations:", oError);
                MessageToast.show("Error accessing service: " + oError.message);
            });
        }
    });
  });