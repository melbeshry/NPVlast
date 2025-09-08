sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/Column",
    "sap/m/Text",
    "sap/m/Input",
    "sap/m/MessageToast",
    "sap/ui/model/type/String"
], function(Controller, JSONModel, Column, Text, Input, MessageToast, StringType) {
    "use strict";

    return Controller.extend("project1.controller.Configuration", {
        // Constants for configuration
        MAX_PERIODS: 20,
        FIXED_ROWS: ["downpayment", "delivery"],

        onInit: function() {
            // Initialize models
            var oConfigModel = new JSONModel({
                frequency: "Annual",
                project: { projectId: "MQR" }
            });
            this.getView().setModel(oConfigModel, "config");

            // Initialize with empty structure
            this._initializeDataModel();
            this._createPeriodTable();
            
            // Then load data if exists
            this._loadDataFromBackend();
        },

        _initializeDataModel: function() {
            var aColumns = [];
            var aAllRows = this.FIXED_ROWS.map(s => ({ rel_period: s }));
            
            // Create columns and period rows
            for (let i = 1; i <= this.MAX_PERIODS; i++) {
                let sPeriod = i + "YP";
                aColumns.push({ header: sPeriod, key: sPeriod });
                aAllRows.push({ rel_period: sPeriod });
            }

            // Initialize empty cells
            aAllRows.forEach(oRow => {
                oRow.cells = {};
                aColumns.forEach(oCol => {
                    oRow.cells[oCol.key] = "";
                });
            });

            var oModel = new JSONModel({
                columns: aColumns,
                rows: aAllRows
            });
            this.getView().setModel(oModel, "periods");
        },

        _loadDataFromBackend: function() {
            var oODataModel = this.getOwnerComponent().getModel("npvModel");
            var oConfigModel = this.getView().getModel("config");
            var oPeriodsModel = this.getView().getModel("periods");
            var sProjectId = oConfigModel.getProperty("/project/projectId");

            if (!oODataModel) {
                console.warn("OData model 'npvModel' not available");
                return;
            }
            this._initializeDataModel();
            this._createPeriodTable();
            // Add delay to allow metadata to load
            setTimeout(function() {
                var oBinding = oODataModel.bindList("/Configurations", null, null, [
                    new sap.ui.model.Filter("project/projectId", sap.ui.model.FilterOperator.EQ, sProjectId)
                ], { $expand: "periods" });

                oBinding.requestContexts().then(function(aContexts) {
                    if (aContexts.length > 0) {
                        var oConfig = aContexts[0].getObject();
                        // Update frequency only if it exists in the loaded data
                        if (oConfig.frequency) {
                            oConfigModel.setProperty("/frequency", oConfig.frequency);
                        }
                        this._updateModelWithLoadedData(oConfig.periods ? oConfig.periods : []);
                        this._createPeriodTable(); // Recreate table to reflect new data
                    } else {
                        // If no data, ensure frequency stays as default "Annual"
                        oConfigModel.setProperty("/frequency", "Annual");
                        this._initializeDataModel();
                        this._createPeriodTable();
                    }
                }.bind(this)).catch(function(oError) {
                    console.error("Error loading data:", oError);
                    // Fallback to default frequency and empty structure on error
                    oConfigModel.setProperty("/frequency", "Annual");
                    this._initializeDataModel();
                    this._createPeriodTable();
                }.bind(this));
            }.bind(this), 500); // 500ms delay
        },

        _updateModelWithLoadedData: function(aPeriodsData) {
            var oPeriodsModel = this.getView().getModel("periods");
            var aRows = oPeriodsModel.getProperty("/rows");

            aPeriodsData.forEach(function(oPeriod) {
                var oRow = aRows.find(r => r.rel_period === oPeriod.rel_period);
                if (oRow && oPeriod.orig_period in oRow.cells) {
                    oRow.cells[oPeriod.orig_period] = oPeriod.value !== null ? oPeriod.value.toString() : "";
                }
            });

            oPeriodsModel.setProperty("/rows", aRows);
        },

        _createPeriodTable: function() {
            var oTable = this.byId("periodsTable");
            oTable.destroyColumns();
            oTable.unbindItems();

            // Add fixed column for row headers
            oTable.addColumn(new Column({
                header: new Text({ text: "Period" }),
                width: "150px"
            }));

            // Add period columns
            var aColumns = this.getView().getModel("periods").getProperty("/columns");
            aColumns.forEach(oCol => {
                oTable.addColumn(new Column({
                    header: new Text({ text: oCol.header }),
                    width: "100px"
                }));
            });

            // Bind items with dynamic row creation
            oTable.bindItems({
                path: "periods>/rows",
                factory: function(sId, oContext) {
                    var oRow = oContext.getObject();
                    var sRelPeriod = oRow.rel_period;
                    var iRowIndex = this.getView().getModel("periods").getProperty("/rows").indexOf(oRow);
                    var aColumns = this.getView().getModel("periods").getProperty("/columns");
                    var aCells = [new Text({ text: sRelPeriod })];

                    aColumns.forEach(oCol => {
                        var nColPeriod = parseInt(oCol.key.replace("YP", ""), 10);
                        var nRowPeriod = this.FIXED_ROWS.length + (iRowIndex - this.FIXED_ROWS.length);
                        if (iRowIndex < this.FIXED_ROWS.length || (nRowPeriod <= nColPeriod + 1)) {
                            aCells.push(new Input({
                                value: {
                                    path: `periods>cells/${oCol.key}`,
                                    type: new StringType()
                                },
                                liveChange: this._onCellChange.bind(this, oCol.key),
                                type: "Number",
                                placeholder: "0-100"
                            }));
                        } else {
                            aCells.push(new Text({ text: "" }));
                        }
                    });

                    return new sap.m.ColumnListItem({ cells: aCells });
                }.bind(this)
            });
        },

        _onCellChange: function(sColumnKey, oEvent) {
            var oInput = oEvent.getSource();
            var sValue = oInput.getValue().trim();
            var oContext = oInput.getBindingContext("periods");

            if (sValue === "") {
                oContext.getModel().setProperty(oContext.getPath() + "/cells/" + sColumnKey, "");
                return;
            }

            var fValue = parseFloat(sValue);
            if (isNaN(fValue) || fValue < 0 || fValue > 100) {
                oInput.setValueState("Error");
                oInput.setValueStateText("Please enter a valid number between 0 and 100.");
                MessageToast.show("Please enter a valid number between 0 and 100.");
            } else {
                oInput.setValueState("None");
                oContext.getModel().setProperty(oContext.getPath() + "/cells/" + sColumnKey, fValue.toString());
            }
        },

        onSave: function() {
            var oPeriodsModel = this.getView().getModel("periods");
            var oConfigModel = this.getView().getModel("config");
            if (!oPeriodsModel || !oConfigModel) {
                console.error("Required models not found.");
                return;
            }
        
            var oPeriodsData = oPeriodsModel.getProperty("/rows");
            var aRows = oPeriodsModel.getProperty("/rows");            
            // Validation: For each orig_period, if any value exists where rel_period ≠ orig_period, ensure value = 100 where rel_period = orig_period
            var hasValidationError = false;
            var aOrigPeriods = oPeriodsModel.getProperty("/columns").map(col => col.key);
        
            aOrigPeriods.forEach(function(origPeriod) {
                var aRelatedValues = [];
                aRows.forEach(oRow => {
                    if (oRow.rel_period !== origPeriod && oRow.cells[origPeriod] !== "") {
                        aRelatedValues.push(parseFloat(oRow.cells[origPeriod]));
                    }
                });
                if (aRelatedValues.length > 0) {
                    var selfIntersection = aRows.find(r => r.rel_period === origPeriod);
                    if (selfIntersection) {
                        var selfValue = parseFloat(selfIntersection.cells[origPeriod]);
                        if (isNaN(selfValue) || Math.abs(selfValue - 100) > 0.01) {
                            console.error(`Validation failed for ${origPeriod}: Self-intersection (${origPeriod}@${origPeriod}) must be 100%, got ${selfValue || "undefined"}`);
                            hasValidationError = true;
                        }
                    }
                }
            });
        
            if (hasValidationError) {
                MessageToast.show("Validation failed: Self-intersection of each populated period must be 100%.");
                return;
            }
        
            var oConfigData = oConfigModel.getData();
            var aPeriodsPayload = [];
            oPeriodsData.forEach(function(oRow) {
                aOrigPeriods.forEach(function(origPeriod) {
                    var sValue = oRow.cells[origPeriod];
                    if (sValue !== "") {
                        aPeriodsPayload.push({
                            orig_period: origPeriod,
                            rel_period: oRow.rel_period,
                            value: parseFloat(sValue) || 0
                        });
                    }
                });
            });
        
            var oPayload = {
                frequency: oConfigData.frequency,
                project: { projectId: oConfigData.project.projectId }, // Use current projectId
                periods: aPeriodsPayload
            };
            console.log("Payload:", JSON.stringify(oPayload, null, 2));
        
            var oODataModel = this.getOwnerComponent().getModel("npvModel");
            if (!oODataModel) {
                console.error("OData model not found.");
                MessageToast.show("Error: OData model not available");
                return;
            }
        
            // Check for existing configuration with the current projectId
            var sProjectId = oConfigData.project.projectId;
            oODataModel.bindList("/Configurations", null, null, [
                new sap.ui.model.Filter("project/projectId", sap.ui.model.FilterOperator.EQ, sProjectId)
            ]).requestContexts().then(function(aContexts) {
                if (aContexts.length > 0) {
                    // Update existing configuration
                    var oContext = aContexts[0]; // Get the context of the matching configuration
                    var sConfigId = oContext.getObject().ID;
        
                    var oBinding = oODataModel.bindContext(`/Configurations(${sConfigId})`);
                    oBinding.requestObject().then(function(oEntityData) {
                        oBinding.getBoundContext().setProperty("frequency", oPayload.frequency);
        
                        var oPeriodsBinding = oODataModel.bindList(`/Configurations(${sConfigId})/periods`);
                        oPeriodsBinding.requestContexts().then(function(aPeriodContexts) {
                            Promise.all(aPeriodContexts.map(ctx => ctx.delete())).then(function() {
                                Promise.all(oPayload.periods.map(function(period) {
                                    return oPeriodsBinding.create(period);
                                })).then(function() {
                                    oODataModel.submitBatch("updateGroup").then(function() {
                                        MessageToast.show("Data updated successfully!");
                                        console.log("Update successful");
                                    }).catch(function(oError) {
                                        console.error("Error updating data:", oError);
                                        MessageToast.show("Failed to update data: " + oError.message);
                                    });
                                }).catch(function(oError) {
                                    console.error("Error creating periods:", oError);
                                    MessageToast.show("Failed to create periods: " + oError.message);
                                });
                            }).catch(function(oError) {
                                console.error("Error deleting periods:", oError);
                                MessageToast.show("Failed to delete periods: " + oError.message);
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
        },

        onProjectChange: function(oEvent) {
            var sProjectId = oEvent.getParameter("selectedItem").getKey();
            this.getView().getModel("config").setProperty("/project/projectId", sProjectId);
            this._loadDataFromBackend();
            this._createPeriodTable(); // Recreate table to reflect new data
        }
    });
});