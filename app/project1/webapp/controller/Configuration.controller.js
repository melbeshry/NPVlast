sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/Column",
    "sap/m/Text",
    "sap/m/Input",
    "sap/m/MessageToast",
    "sap/ui/model/type/String",
    "sap/m/MessageBox"
], function(Controller, JSONModel, Column, Text, Input, MessageToast, StringType, MessageBox) {
    "use strict";

    return Controller.extend("project1.controller.Configuration", {
        // Constants for configuration
        MAX_PERIODS: 20,
        FIXED_ROWS: ["downpayment", "delivery"],

        onInit: function() {
            // Initialize flags for preventing multiple operations
            this._isSaving = false;
            this._hasUnsavedChanges = false;
            this._initialDataSnapshot = null;
            this._lastSaveTime = 0;
            
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
            
            // Set up change tracking after initial load
            setTimeout(function() {
                this._createInitialSnapshot();
                this._setupChangeTracking();
            }.bind(this), 1000);
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

        _createInitialSnapshot: function() {
            var oPeriodsModel = this.getView().getModel("periods");
            var oConfigModel = this.getView().getModel("config");
            
            this._initialDataSnapshot = {
                config: JSON.parse(JSON.stringify(oConfigModel.getData())),
                periods: JSON.parse(JSON.stringify(oPeriodsModel.getData()))
            };
            
            console.log("Initial data snapshot created");
        },

        _setupChangeTracking: function() {
            var oPeriodsModel = this.getView().getModel("periods");
            var oConfigModel = this.getView().getModel("config");
            
            // Track changes in periods model
            oPeriodsModel.attachPropertyChange(function() {
                this._hasUnsavedChanges = true;
                this._updateSaveButtonState();
            }.bind(this));
            
            // Track changes in config model
            oConfigModel.attachPropertyChange(function() {
                this._hasUnsavedChanges = true;
                this._updateSaveButtonState();
            }.bind(this));
        },

        _updateSaveButtonState: function() {
            var oSaveButton = this.byId("saveButton");
            if (oSaveButton) {
                oSaveButton.setEnabled(this._hasUnsavedChanges && !this._isSaving);
                oSaveButton.setText(this._isSaving ? "Saving..." : "Save");
            }
        },

        _hasDataChanged: function() {
            if (!this._initialDataSnapshot) {
                return false;
            }
            
            var oPeriodsModel = this.getView().getModel("periods");
            var oConfigModel = this.getView().getModel("config");
            
            var currentData = {
                config: oConfigModel.getData(),
                periods: oPeriodsModel.getData()
            };
            
            // Compare frequency change
            if (currentData.config.frequency !== this._initialDataSnapshot.config.frequency) {
                return true;
            }
            
            // Compare project change
            if (currentData.config.project.projectId !== this._initialDataSnapshot.config.project.projectId) {
                return true;
            }
            
            // Compare cell values
            var currentRows = currentData.periods.rows;
            var initialRows = this._initialDataSnapshot.periods.rows;
            
            for (var i = 0; i < currentRows.length; i++) {
                var currentCells = currentRows[i].cells;
                var initialCells = initialRows[i].cells;
                
                for (var key in currentCells) {
                    if (currentCells[key] !== initialCells[key]) {
                        return true;
                    }
                }
            }
            
            return false;
        },

        _hasValidData: function() {
            var oPeriodsModel = this.getView().getModel("periods");
            var aRows = oPeriodsModel.getProperty("/rows");
            var aColumns = oPeriodsModel.getProperty("/columns");
            
            // Check if at least one cell has data
            for (var i = 0; i < aRows.length; i++) {
                for (var j = 0; j < aColumns.length; j++) {
                    var sValue = aRows[i].cells[aColumns[j].key];
                    if (sValue && sValue.trim() !== "") {
                        return true;
                    }
                }
            }
            
            return false;
        },

        _preventRapidClicks: function() {
            var currentTime = Date.now();
            if (currentTime - this._lastSaveTime < 2000) { // 2 second cooldown
                MessageToast.show("Please wait before saving again");
                return true;
            }
            this._lastSaveTime = currentTime;
            return false;
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
                        if (oConfig.frequency) {
                            oConfigModel.setProperty("/frequency", oConfig.frequency);
                        }
                        this._updateModelWithLoadedData(oConfig.periods ? oConfig.periods : []);
                        this._createPeriodTable();
                    } else {
                        oConfigModel.setProperty("/frequency", "Annual");
                        this._initializeDataModel();
                        this._createPeriodTable();
                    }
                }.bind(this)).catch(function(oError) {
                    console.error("Error loading data:", oError);
                    oConfigModel.setProperty("/frequency", "Annual");
                    this._initializeDataModel();
                    this._createPeriodTable();
                }.bind(this));
            }.bind(this), 500);
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
                this._hasUnsavedChanges = true;
                this._updateSaveButtonState();
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
                this._hasUnsavedChanges = true;
                this._updateSaveButtonState();
            }
        },

        onSave: function() {
            // Prevent multiple saves
            if (this._isSaving) {
                MessageToast.show("Save operation is already in progress");
                return;
            }

            // Prevent rapid clicking
            if (this._preventRapidClicks()) {
                return;
            }

            // Check if data has actually changed
            if (!this._hasDataChanged()) {
                MessageBox.information("No changes detected. Please modify the configuration before saving.", {
                    title: "No Changes"
                });
                return;
            }

            // Check if there's valid data to save
            if (!this._hasValidData()) {
                MessageBox.warning("Please enter at least one percentage value before saving.", {
                    title: "No Data Entered"
                });
                return;
            }

            // Set saving state
            this._isSaving = true;
            this._hasUnsavedChanges = false;
            this._updateSaveButtonState();

            var oPeriodsModel = this.getView().getModel("periods");
            var oConfigModel = this.getView().getModel("config");
            
            if (!oPeriodsModel || !oConfigModel) {
                console.error("Required models not found.");
                this._resetSaveState();
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
                MessageBox.error("Validation failed: Self-intersection of each populated period must be 100%.", {
                    title: "Validation Error"
                });
                this._resetSaveState();
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
        
            // Always create a new configuration record
            var oPayload = {
                frequency: oConfigData.frequency,
                project: { projectId: oConfigData.project.projectId },
                periods: aPeriodsPayload
            };
            
            console.log("Payload:", JSON.stringify(oPayload, null, 2));
        
            var oODataModel = this.getOwnerComponent().getModel("npvModel");
            if (!oODataModel) {
                console.error("OData model not found.");
                MessageBox.error("Error: OData model not available", {
                    title: "System Error"
                });
                this._resetSaveState();
                return;
            }
        
            // Always create new configuration - no checking for existing
            var oBinding = oODataModel.bindList("/Configurations");
            var oContext = oBinding.create(oPayload);
            
            // Handle success and error
            oContext.created().then(function() {
                MessageToast.show("New configuration saved successfully!");
                console.log("Create successful - new configuration created");
                this._createInitialSnapshot(); // Update snapshot after successful save
                this._resetSaveState();
            }.bind(this)).catch(function(oError) {
                console.error("Error saving data:", oError);
                MessageBox.error("Failed to save configuration: " + (oError.message || "Unknown error"), {
                    title: "Save Error"
                });
                this._hasUnsavedChanges = true; // Restore unsaved changes flag
                this._resetSaveState();
            }.bind(this));

            // Submit batch
            oODataModel.submitBatch("updateGroup").then(function() {
                console.log("Batch submitted for creation");
            }).catch(function(oError) {
                console.error("Batch submission failed:", oError);
                MessageBox.error("Failed to submit changes: " + (oError.message || "Unknown error"), {
                    title: "Submission Error"
                });
            });
        },

        _resetSaveState: function() {
            this._isSaving = false;
            this._updateSaveButtonState();
        },

        onProjectChange: function(oEvent) {
            var sProjectId = oEvent.getParameter("selectedItem").getKey();
            this.getView().getModel("config").setProperty("/project/projectId", sProjectId);
            this._hasUnsavedChanges = true;
            this._updateSaveButtonState();
            this._loadDataFromBackend();
            this._createPeriodTable();
        },

        // Add browser/navigation warning for unsaved changes
        onExit: function() {
            if (this._hasUnsavedChanges) {
                // This would typically be handled by the router or application controller
                // for preventing navigation away from unsaved changes
                console.warn("User is leaving with unsaved changes");
            }
        }
    });
});