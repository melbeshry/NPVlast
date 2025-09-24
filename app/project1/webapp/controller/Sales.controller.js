sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/Column",
    "sap/m/Text",
    "sap/m/Input",
    "sap/m/MessageToast",
    "sap/m/VBox"
], function(Controller, JSONModel, Column, Text, Input, MessageToast, VBox) {
    "use strict";

    return Controller.extend("project1.controller.Sales", {
        onInit: function() {
            
            this._isDataChanged = false;
            // Get URL parameters
            const oUrlParams = new URLSearchParams(window.location.search);
            const token = oUrlParams.get("p") || "";
            let tokenData = {};

            if (token) {
                try {
                    // Split JWT token and decode payload (second part)
                    const payloadBase64 = token.split('.')[1];
                    const decodedPayload = JSON.parse(atob(payloadBase64));
                    // Parse deliveryDate to ensure compatibility with sap.ui.model.type.Date
                    let deliveryDate = decodedPayload.deliveryDate || new Date().toLocaleDateString("en-GB");
                    if (decodedPayload.deliveryDate) {
                        // Ensure deliveryDate is in YYYY-MM-DD format for the model
                        const date = new Date(decodedPayload.deliveryDate);
                        if (!isNaN(date)) {
                            deliveryDate = date.toISOString().split('T')[0]; // Convert to YYYY-MM-DD
                        }
                    }
                    tokenData = {
                        discountRate: decodedPayload.discountRate || "",
                        unitNpv: decodedPayload.unitNpv || "",
                        pricePlan: decodedPayload.pricePlan || "",
                        leadId: decodedPayload.leadId || "",
                        projectId: decodedPayload.projectID || "", // Default project
                        projectType: decodedPayload.projectType || "",
                        psId: decodedPayload.PSID || "",
                        pcId: decodedPayload.PCID || "",
                        unitId: decodedPayload.unitID || "",
                        deliveryDate: deliveryDate,
                        tenant: decodedPayload.tenant
                    };
                } catch (e) {
                    console.error("Error decoding JWT token:", e);
                    MessageToast.show("Error: Invalid JWT token");
                }
            } else {
                console.error("No JWT token found in URL");
                MessageToast.show("Error: No token provided");
                tokenData = {
                    discountRate: "",
                    unitNpv: "",
                    pricePlan: "",
                    leadId: "",
                    projectId: "", // Default project
                    projectType: "",
                    psId: "",
                    pcId: "",
                    unitId: "",
                    deliveryDate: new Date().toLocaleDateString("en-GB"),
                    tenant: "DEV"
                };
            }

            if (token === "scv2") {
            // Use test data when p=scv2
            tokenData = {
                discountRate: "30.25",
                unitNpv: "7500000.00",
                pricePlan: "5YP",
                leadId: "4045",
                projectId: "ZAHRA",
                projectType: "NUCA",
                psId: "PS-67",
                pcId: "7000000",
                unitId: "ZAHRB2",
                deliveryDate: "10.10.2027",
                tenant: "dev"
            };}

            // Create or update the sales model with token parameters
            const oSalesModel = new JSONModel({
                isSimulationDone: false, // Initial state
                unitNpv: tokenData.unitNpv,
                discountRate: tokenData.discountRate,
                leadId: tokenData.leadId,
                pricePlan: tokenData.pricePlan,
                project: { projectId: tokenData.projectId },
                deliveryDate: tokenData.deliveryDate,
                projectType: tokenData.projectType,
                unitId: tokenData.unitId,
                psId: tokenData.psId,
                pcId: tokenData.pcId,
                tenant: tokenData.tenant,
                tableData: [],
                futureValue: "",
                npv: ""
            });
            this.getView().setModel(oSalesModel, "sales");

            // Load OData model
            var oODataModel = this.getOwnerComponent().getModel("npvModel");
            if (!oODataModel) {
                console.error("OData model not found.");
                MessageToast.show("Error: OData model not available");
                return;
            }
            console.log("OData Model:", oODataModel); // Debug: Verify model instance
            // Log Periods entity metadata
            oODataModel.getMetaModel().requestObject("/Periods/").then(function(oMetaData) {
                console.log("Periods Metadata:", oMetaData); // Debug: Verify property names
            }).catch(function(oError) {
                console.error("Error fetching Periods metadata:", oError);
            });
            // Log PeriodRelations entity metadata
            oODataModel.getMetaModel().requestObject("/PeriodRelations/").then(function(oMetaData) {
                console.log("PeriodRelations Metadata:", oMetaData); // Debug: Verify property names
            }).catch(function(oError) {
                console.error("Error fetching PeriodRelations metadata:", oError);
            });
            // Log Configurations entity metadata
            oODataModel.getMetaModel().requestObject("/Configurations/").then(function(oMetaData) {
                console.log("Configurations Metadata:", oMetaData); // Debug: Verify navigation properties
            }).catch(function(oError) {
                console.error("Error fetching Configurations metadata:", oError);
            });

            var that = this;
            // Validate projectId and pricePlan
            this._validateProjectAndPricePlan(oODataModel, tokenData.projectId, tokenData.pricePlan).then(function(bIsValid) {
                if (!bIsValid) {
                    MessageToast.show("Error: Project or Price Plan not configured.");
                    return;
                }

                // Load configuration data for the default project
                that._loadDataFromOData(oODataModel).then(function(oConfigData) {
                    console.log("Loaded config data:", oConfigData);
                    if (oConfigData.periods.length > 0) {
                        MessageToast.show("Frequency: " + oConfigData.frequency);
                    } else {
                        MessageToast.show("Project is not configured yet");
                    }

                    var iBaseRows = that._getRowCount(oConfigData.frequency);
                    var iRows = iBaseRows + 3; // Downpayment + Contract Payment + Delivery Payment
                    console.log("Row count (including Downpayment, Contract Payment, and Delivery Payment):", iRows);
                    var aTableData = that._initializeTableData(iRows, parseInt(oSalesModel.getProperty("/pricePlan").replace("YP", "")) || 1, oConfigData.frequency);
                    console.log("Table data:", aTableData); // Debug
                    oSalesModel.setProperty("/tableData", aTableData);
                    that._oConfigData = oConfigData;
                    that._generateTable();
                }).catch(function(oError) {
                    console.error("Error loading configuration:", oError);
                    MessageToast.show("Error loading configuration, defaulting to Annual");
                    that._buildTableWithDefault(that.byId("salesTable"), parseInt(oSalesModel.getProperty("/pricePlan").replace("YP", "")) || 1, oSalesModel);
                });
            }).catch(function(oError) {
                console.error("Error validating project or price plan:", oError);
                MessageToast.show("Error validating project or price plan: " + oError.message);
            });

            // Add these flags for Send to CX error prevention
            this._isSending = false;
            this._lastSendTime = 0;
            this._hasBeenSentSuccessfully = false;
        },

        _validateProjectAndPricePlan: function(oODataModel, sProjectId, sPricePlan) {
    return new Promise(function(resolve, reject) {
        console.log("Validating Project ID:", sProjectId, "Price Plan:", sPricePlan);
        
        // Check if projectId exists in Configurations
        var oConfigList = oODataModel.bindList("/Configurations", null, 
            [new sap.ui.model.Sorter("createdAt", true)], // Sort by createdAt descending
            [new sap.ui.model.Filter("project_projectId", sap.ui.model.FilterOperator.EQ, sProjectId)]
        );
        
        oConfigList.requestContexts().then(function(aContexts) {
            console.log("All Configurations found for validation:", aContexts.length);
            if (aContexts.length === 0) {
                console.error("Project ID not found:", sProjectId);
                resolve(false);
                return;
            }
            
            // Project exists, get latest Configuration ID (first one after sorting)
            const sConfigId = aContexts[0].getObject().ID;
            console.log("Latest Configuration ID for validation:", sConfigId);
            
            // Check if pricePlan exists in PeriodRelations for this latest config
            var oPeriodRelationsList = oODataModel.bindList("/PeriodRelations", null, null, [
                new sap.ui.model.Filter("config_ID", sap.ui.model.FilterOperator.EQ, sConfigId),
                new sap.ui.model.Filter("orig_period", sap.ui.model.FilterOperator.EQ, sPricePlan)
            ]);
            
            oPeriodRelationsList.requestContexts().then(function(aPeriodContexts) {
                console.log("PeriodRelations found for price plan in latest config:", aPeriodContexts.length);
                if (aPeriodContexts.length === 0) {
                    console.error("Price Plan not found in latest configuration:", sPricePlan);
                    resolve(false);
                } else {
                    resolve(true);
                }
            }).catch(function(oError) {
                reject(oError);
            });
        }).catch(function(oError) {
            reject(oError);
        });
    });
},

        // _loadDistinctPricePlans: function(oODataModel, sProjectId) {
        //     var that = this;
        //     return new Promise(function(resolve, reject) {
        //         if (!oODataModel) {
        //             reject("OData model not found");
        //             return;
        //         }

        //         setTimeout(function() {
        //             var oBinding = oODataModel.bindList("/Configurations", null, null, [
        //                 new sap.ui.model.Filter("project_projectId", sap.ui.model.FilterOperator.EQ, sProjectId)
        //             ], { $expand: "periods" });

        //             oBinding.requestContexts().then(function(aContexts) {
        //                 console.log("OData Contexts for Price Plans for Project " + sProjectId + ":", aContexts);
        //                 if (aContexts.length > 0) {
        //                     var aAllPeriods = aContexts.reduce(function(aResult, oContext) {
        //                         var oConfig = oContext.getObject();
        //                         return aResult.concat((oConfig.periods.results || oConfig.periods || []).map(p => p.orig_period));
        //                     }, []);
        //                     var aPricePlans = [...new Set(aAllPeriods)].sort(); // Unique and sorted
        //                     console.log("Distinct Price Plans for Project " + sProjectId + ":", aPricePlans);
        //                     resolve(aPricePlans);
        //                 } else {
        //                     console.log("No Configurations found for project " + sProjectId + ", returning empty price plan list");
        //                     resolve([]);
        //                 }
        //             }).catch(function(oError) {
        //                 console.error("Error loading distinct price plans for project " + sProjectId + ":", oError);
        //                 reject(oError);
        //             });
        //         }.bind(this), 500); // 500ms delay to allow metadata to load
        //     });
        // },

        // onProjectChange: function(oEvent) {
        //     var sProjectId = oEvent.getParameter("selectedItem").getKey();
        //     var oSalesModel = this.getView().getModel("sales");
        //     oSalesModel.setProperty("/project/projectId", sProjectId);

        //     // Reload price plans for the selected project
        //     var oODataModel = this.getOwnerComponent().getModel("npvModel");
        //     var that = this;
        //     this._loadDistinctPricePlans(oODataModel, sProjectId).then(function(aPricePlans) {
        //         console.log("Updated Price Plans for Project " + sProjectId + ":", aPricePlans);
        //         var oPricePlanSelect = that.byId("pricePlanSelect");
        //         oPricePlanSelect.setModel(new JSONModel({ pricePlans: aPricePlans }), "pricePlans");
        //         oPricePlanSelect.bindAggregation("items", {
        //             path: "pricePlans>/pricePlans",
        //             template: new sap.ui.core.Item({
        //                 key: "{pricePlans>}",
        //                 text: "{pricePlans>}"
        //             })
        //         });

        //         // Reload configuration data for the new project
        //         that._loadDataFromOData(oODataModel).then(function(oConfigData) {
        //             console.log("Updated config data for project " + sProjectId + ":", oConfigData);
        //             that._oConfigData = oConfigData;
        //             var iBaseRows = that._getRowCount(oConfigData.frequency);
        //             var iRows = iBaseRows + 3; // Downpayment + Contract Payment
        //             var iYears = parseInt(oSalesModel.getProperty("/pricePlan").replace("YP", "")) || 1;
        //             var aTableData = that._initializeTableData(iRows, iYears, oConfigData.frequency);
        //             oSalesModel.setProperty("/tableData", aTableData);
        //             that._generateTable();
        //         }).catch(function(oError) {
        //             console.error("Error loading configuration for project " + sProjectId + ":", oError);
        //             MessageToast.show("Error loading configuration");
        //         });
        //     }).catch(function(oError) {
        //         console.error("Error loading distinct price plans for project " + sProjectId + ":", oError);
        //         MessageToast.show("Error loading price plans");
        //     });
        // },

        // onPricePlanChange: function(oEvent) {
        //     var sPricePlan = oEvent.getParameter("selectedItem").getKey();
        //     var oSalesModel = this.getView().getModel("sales");
        //     oSalesModel.setProperty("/pricePlan", sPricePlan);
        //     this._generateTable();
        // },

        _generateTable: function() {
    var oView = this.getView();
    var oSalesModel = oView.getModel("sales");
    var sPricePlan = oSalesModel.getProperty("/pricePlan");
    var oTable = this.byId("salesTable");
    oTable.removeAllColumns();
    oSalesModel.setProperty("/tableData", []);
    oSalesModel.setProperty("/futureValue", "");
    oSalesModel.setProperty("/npv", "");

    if (!sPricePlan || sPricePlan === "") {
        return;
    }

    var iPricePlanYears = parseInt(sPricePlan.replace("YP", "")) || 1; // e.g., 3 for 3YP
    var oODataModel = this.getOwnerComponent().getModel("npvModel");

    if (!oODataModel) {
        console.error("OData model not found.");
        sap.m.MessageToast.show("Error: OData model not available");
        return;
    }

    var that = this;
    this._loadDataFromOData(oODataModel).then(function(oConfigData) {
        console.log("Loaded config data:", oConfigData);
        if (oConfigData.periods.length > 0) {
            sap.m.MessageToast.show("Frequency: " + oConfigData.frequency);
        } else {
            sap.m.MessageToast.show("Project is not configured yet");
        }

        var iBaseRows = that._getRowCount(oConfigData.frequency);
        var iRows = iBaseRows + 3; // Downpayment + Contract Payment + Delivery Payment
        console.log("Row count (including Downpayment and Contract Payment):", iRows);
        var aTableData = that._initializeTableData(iRows, iPricePlanYears, oConfigData.frequency);

        // Add columns with dynamic year headers starting from 2025
        oTable.addColumn(new sap.m.Column({
            header: new sap.m.Text({ text: "Period" })
        }));
        var oToday = new Date(); // e.g., August 27, 2025
        var iCurrentYear = oToday.getFullYear(); // 2025
        var iCurrentMonth = oToday.getMonth() + 1; // 8 (August)
        var iStartPeriodIndex = that._getStartPeriodIndex(oConfigData.frequency, iCurrentMonth); // e.g., 2 for Q3
        var sDeliveryDate = oSalesModel.getProperty("/deliveryDate"); // e.g., "12.12.2027"
        var oDeliveryDate = new Date(sDeliveryDate.split(".").reverse().join("-"));
        var iDeliveryYear = oDeliveryDate.getFullYear(); // 2027
        var iColumns = iPricePlanYears + (iStartPeriodIndex > 0 ? 1 : 0); // e.g., 3 + 1 = 4 for Q3 start
        iColumns = Math.max(iColumns, iDeliveryYear - iCurrentYear + 1); // Ensure delivery year is included

        for (var i = 0; i < iColumns; i++) {
            oTable.addColumn(new sap.m.Column({
                header: new sap.m.Text({ text: (iCurrentYear + i).toString() })
            }));
        }

        oTable.bindItems({
            path: "sales>/tableData",
            factory: function(sId, oContext) {
                return new sap.m.ColumnListItem({
                    cells: that._createCells(iColumns, oConfigData.frequency, oContext)
                });
            }
        });

        oSalesModel.setProperty("/tableData", aTableData);
        that._oConfigData = oConfigData;
    }).catch(function(oError) {
        console.error("Error loading configuration:", oError);
        sap.m.MessageToast.show("Error loading configuration, defaulting to Annual");
        that._buildTableWithDefault(oTable, iPricePlanYears, oSalesModel);
    });
},

        
_loadDataFromOData: function(oODataModel) {
    var that = this;
    return new Promise(function(resolve, reject) {
        if (!oODataModel) {
            reject("OData model not found");
            return;
        }

        var oSalesModel = that.getView().getModel("sales");
        var sProjectId = oSalesModel.getProperty("/project/projectId") || "";
        var sPricePlan = oSalesModel.getProperty("/pricePlan") || "5YP";

        setTimeout(function() {
            // First, get all configurations for the project (no $expand, no $top)
            var oBinding = oODataModel.bindList("/Configurations", null, 
                [new sap.ui.model.Sorter("createdAt", true)], // Sort by createdAt descending
                [new sap.ui.model.Filter("project_projectId", sap.ui.model.FilterOperator.EQ, sProjectId)]
            );

            oBinding.requestContexts().then(function(aContexts) {
                console.log("All Configuration Contexts Retrieved:", aContexts.length);
                if (aContexts.length > 0) {
                    // Get the latest configuration (first one due to sorting)
                    var oLatestConfig = aContexts[0].getObject();
                    var sLatestConfigId = oLatestConfig.ID;
                    console.log("Latest Configuration ID:", sLatestConfigId, "Created At:", oLatestConfig.createdAt);

                    // Now get periods for this specific configuration
                    var oPeriodsBinding = oODataModel.bindList("/PeriodRelations", null, null, [
                        new sap.ui.model.Filter("config_ID", sap.ui.model.FilterOperator.EQ, sLatestConfigId),
                        new sap.ui.model.Filter("orig_period", sap.ui.model.FilterOperator.EQ, sPricePlan)
                    ]);

                    oPeriodsBinding.requestContexts().then(function(aPeriodContexts) {
                        console.log("Period Contexts Retrieved for latest config:", aPeriodContexts.length);
                        
                        var aPeriods = aPeriodContexts.map(function(oContext) {
                            var oPeriod = oContext.getObject();
                            return {
                                period: oPeriod.rel_period,
                                totalPercentage: parseFloat(oPeriod.value) || 0
                            };
                        });

                        console.log("Aggregated Periods (Latest Configuration):", aPeriods);

                        resolve({
                            frequency: oLatestConfig.frequency,
                            project: { projectId: oLatestConfig.project_projectId || sProjectId },
                            periods: aPeriods,
                            configId: oLatestConfig.ID,
                            createdAt: oLatestConfig.createdAt
                        });
                    }).catch(function(oError) {
                        console.error("Error loading periods for latest configuration:", oError);
                        reject(oError);
                    });
                } else {
                    console.log("No Configurations found for project " + sProjectId + ", defaulting to empty configuration");
                    resolve({ 
                        frequency: "Annual", 
                        project: { projectId: sProjectId }, 
                        periods: [],
                        configId: null,
                        createdAt: null
                    });
                }
            }).catch(function(oError) {
                console.error("Error loading Configurations for project " + sProjectId + ":", oError);
                reject(oError);
            });
        }.bind(this), 500);
    });
},

        _loadDistinctProjects: function(oODataModel) {
            var that = this;
            return new Promise(function(resolve, reject) {
                if (!oODataModel) {
                    reject("OData model not found");
                    return;
                }

                setTimeout(function() {
                    var oBinding = oODataModel.bindList("/Configurations", null, null, null, {
                        $select: "project_projectId"
                    });

                    oBinding.requestContexts().then(function(aContexts) {
                        console.log("OData Contexts for Distinct Projects:", aContexts);
                        if (aContexts.length > 0) {
                            var aProjects = aContexts.map(function(oContext) {
                                var oConfig = oContext.getObject();
                                console.log("Config Object:", oConfig); // Debug log
                                var projectId = oConfig.project_projectId;
                                return projectId ? { projectId: projectId } : null;
                            }).filter(function(project) {
                                return project !== null;
                            }).filter(function(project, index, self) {
                                return self.findIndex(p => p.projectId === project.projectId) === index;
                            });
                            console.log("Distinct Projects:", aProjects);
                            resolve(aProjects);
                        } else {
                            console.log("No Configurations found, returning empty project list");
                            resolve([]);
                        }
                    }).catch(function(oError) {
                        console.error("Error loading distinct projects:", oError);
                        reject(oError);
                    });
                }.bind(this), 500); // 500ms delay to allow metadata to load
            });
        },

        _buildTableWithDefault: function(oTable, iYears, oSalesModel) {
            var iRows = this._getRowCount("Annual") + 3; // Downpayment + Contract Payment
            var aTableData = this._initializeTableData(iRows, iYears, "Annual");

            oTable.addColumn(new Column({
                header: new Text({ text: "Period" })
            }));

            for (var i = 1; i <= iYears; i++) {
                oTable.addColumn(new Column({
                    header: new Text({ text: `Year ${i}` })
                }));
            }

            oTable.bindItems({
                path: "sales>/tableData",
                factory: function(sId, oContext) {
                    return new sap.m.ColumnListItem({
                        cells: this._createCells(iYears, "Annual", oContext)
                    });
                }.bind(this)
            });

            oSalesModel.setProperty("/tableData", aTableData);
            this._oConfigData = { frequency: "Annual", project: { projectId: oSalesModel.getProperty("/project/projectId") }, periods: [] };
        },

        _getRowCount: function(sFrequency) {
            console.log("Evaluating frequency:", sFrequency);
            switch (sFrequency) {
                case "Annual": return 1;
                case "Semi": return 2;
                case "Quarter": return 4;
                case "Monthly": return 12;
                case "Daily": return 365;
                default:
                    console.warn("Unknown frequency, defaulting to 1:", sFrequency);
                    return 1;
            }
        },

        // onDeliveryDateChange: function(oEvent) {
        //     var oDatePicker = oEvent.getSource();
        //     var sNewValue = oDatePicker.getValue(); // Get new date in DD.MM.YYYY format
        //     var oSalesModel = this.getView().getModel("sales");
        //     oSalesModel.setProperty("/deliveryDate", sNewValue);
        //     console.log("Delivery Date changed to:", sNewValue);
        //     this._generateTable(); // Regenerate table to reflect new delivery year
        // },

        _initializeTableData: function(iRows, iYears, sFrequency) {
            var aData = [];
            var periodLabels = this._getPeriodLabels(sFrequency, iRows);

            for (var i = 0; i < iRows; i++) {
                var oRow = { period: periodLabels[i] };
                for (var j = 0; j < iYears; j++) {
                    oRow[`col${j}`] = "";
                }
                aData.push(oRow);
            }
            console.log("Table data:", JSON.stringify(aData, null, 2));
            return aData;
        },

        _getPeriodLabels: function(sFrequency, iRows) {
            var baseLabels;
            switch (sFrequency) {
                case "Annual": baseLabels = ["Year"]; break;
                case "Semi": baseLabels = ["H1", "H2"]; break;
                case "Quarter": baseLabels = ["Q1", "Q2", "Q3", "Q4"]; break;
                case "Monthly": baseLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; break;
                case "Daily": baseLabels = Array.from({ length: 365 }, (_, i) => `Day ${i + 1}`); break;
                default: baseLabels = Array.from({ length: this._getRowCount(sFrequency) }, (_, i) => `Period ${i + 1}`);
            }
            return ["Downpayment", "Contract Payment", "Delivery Payment"].concat(baseLabels.slice(0, iRows - 3));
        },
_onTableInputChange: function(oEvent) {
    var oSalesModel = this.getView().getModel("sales");
    
    // Mark data as changed (disable Send to CX)
    this._isDataChanged = true;
    oSalesModel.setProperty("/isSimulationDone", false);
    this._updateSendToCXButtonState();
},
_createCells: function(iColumns, sFrequency, oContext) {
    var aCells = [new sap.m.Text({ text: "{sales>period}" })];
    var sPeriod = oContext.getProperty("period");
    var oToday = new Date(); // e.g., August 27, 2025
    var iCurrentMonth = oToday.getMonth() + 1; // 8 (August)
    var iCurrentYear = oToday.getFullYear(); // 2025
    var iStartPeriodIndex = this._getStartPeriodIndex(sFrequency, iCurrentMonth); // e.g., 2 for Q3
    var aPeriods = this._getPeriods(sFrequency); // e.g., ["Q1", "Q2", "Q3", "Q4"]
    var oSalesModel = this.getView().getModel("sales");
    var sDeliveryDate = oSalesModel.getProperty("/deliveryDate"); // e.g., "15.09.2025"
    var oDeliveryDate = new Date(sDeliveryDate.split(".").reverse().join("-")); // Convert DD.MM.YYYY to YYYY-MM-DD
    var iDeliveryYear = oDeliveryDate.getFullYear(); // 2025
    var iRelativeDeliveryColumn = iDeliveryYear - iCurrentYear; // e.g., 0 (2025 - 2025)
    var iDeliveryMonth = oDeliveryDate.getMonth() + 1; // 9 (September)
    var sDeliveryPeriod = this._getPeriodForDate(sFrequency, iDeliveryMonth); // e.g., Q3
    var iPricePlanYears = parseInt(oSalesModel.getProperty("/pricePlan").replace("YP", "")) || 1; // e.g., 3 for 3YP
    var sDownpaymentPeriod = this._getPeriodForDate(sFrequency, iCurrentMonth); // e.g., Q3 for August

    for (let i = 0; i < iColumns; i++) {
        var bVisible = false;
        var iColumnYear = iCurrentYear + i; // e.g., i=0: 2025, i=1: 2026, i=2: 2027, i=3: 2028

        if (sPeriod === "Downpayment" || sPeriod === "Contract Payment") {
            // Editable only in first column (2025)
            bVisible = (i === 0);
        } else if (sPeriod === "Delivery Payment") {
            // Editable only in delivery year (e.g., 2025)
            bVisible = (i === iRelativeDeliveryColumn);
        } else {
            // Regular periods (Q1, Q2, Q3, Q4) - with 6-month installment delay
            var iPeriodIndex = aPeriods.indexOf(sPeriod);
            if (iPeriodIndex >= 0) {
                // Calculate 6-month delay for installments
                var iInstallmentStartGlobalIndex;
                if (sFrequency === "Quarter") {
                    // 6 months = 2 quarters ahead from current position
                    iInstallmentStartGlobalIndex = iStartPeriodIndex + 2;
                } else if (sFrequency === "Semi") {
                    // 6 months = 1 semi period ahead 
                    iInstallmentStartGlobalIndex = iStartPeriodIndex + 1;
                } else if (sFrequency === "Monthly") {
                    // 6 months ahead
                    iInstallmentStartGlobalIndex = iStartPeriodIndex + 6;
                } else {
                    // Annual: next year
                    iInstallmentStartGlobalIndex = aPeriods.length;
                }

                var iGlobalPeriodIndex = i * aPeriods.length + iPeriodIndex;
                var iEndGlobalIndex = iInstallmentStartGlobalIndex + aPeriods.length * iPricePlanYears;

                // Show installments starting from 6 months ahead
                if (iGlobalPeriodIndex >= iInstallmentStartGlobalIndex && iGlobalPeriodIndex < iEndGlobalIndex) {
                    bVisible = true;
                }
            }
        }

        // Use VBox to stack Input and Text for amount
        var oVBox = new sap.m.VBox({
            items: [
                new sap.m.Input({
                    value: `{sales>col${i}}`,
                    type: "Number",
                    placeholder: "Enter percentage",
                    visible: bVisible,
                    width: "100%",
                    change: this._onTableInputChange.bind(this)

                }),
                new sap.m.Text({
                    text: `{sales>amountCol${i}}`,
                    wrapping: false,
                    textAlign: "End",
                    visible: {
                        parts: [
                            { path: 'sales>/futureValue' },
                            { path: `sales>amountCol${i}` },
                            { value: bVisible }
                        ],
                        formatter: function(futureValue, amount, visible) {
                            return !!futureValue && !!amount && visible;
                        }
                    }
                })
            ],
            visible: bVisible
        });
        aCells.push(oVBox);
    }
    return aCells;
},
        
        _getPeriodForDate: function(sFrequency, iMonth) {
            switch (sFrequency) {
                case "Quarter":
                    if (iMonth >= 1 && iMonth <= 3) return "Q1";
                    if (iMonth >= 4 && iMonth <= 6) return "Q2";
                    if (iMonth >= 7 && iMonth <= 9) return "Q3";
                    return "Q4";
                case "Semi":
                    return iMonth <= 6 ? "H1" : "H2";
                case "Monthly":
                    var aMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    return aMonths[iMonth - 1];
                case "Annual":
                    return "Year";
                case "Daily":
                    return `Day ${Math.ceil((new Date(2025, iMonth - 1, 1) - new Date(2025, 0, 1)) / (1000 * 60 * 60 * 24))}`;
                default:
                    return "Period 1";
            }
        },

        _getPeriods: function(sFrequency) {
            switch (sFrequency) {
                case "Quarter":
                    return ["Q1", "Q2", "Q3", "Q4"];
                case "Semi":
                    return ["H1", "H2"];
                case "Monthly":
                    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                default:
                    return ["Annual"];
            }
        },
        
        _getStartPeriodIndex: function(sFrequency, iCurrentMonth) {
            var iStartIndex = 0;
            if (sFrequency === "Quarter") {
                if (iCurrentMonth >= 7) iStartIndex = 2; // Q3 (Jul-Sep)
                else if (iCurrentMonth >= 4) iStartIndex = 1; // Q2 (Apr-Jun)
                else iStartIndex = 0; // Q1 (Jan-Mar)
            } else if (sFrequency === "Semi") {
                if (iCurrentMonth >= 7) iStartIndex = 1; // H2 (Jul-Dec)
                else iStartIndex = 0; // H1 (Jan-Jun)
            } else if (sFrequency === "Monthly") {
                iStartIndex = Math.max(0, iCurrentMonth); // Start from next month (0-based + 1)
            }
            return iStartIndex;
        },

        // Enhanced number formatting function
_formatEGP: function(fAmount) {
    if (!fAmount || fAmount === 0) return "";
    
    // Format with thousands separator (,) and 2 decimal places
    var sFormatted = parseFloat(fAmount).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    return sFormatted + " EGP";
},

        onSimulate: function() {
    var oSalesModel = this.getView().getModel("sales");
    var oData = oSalesModel.getData();
    var oConfigData = this._oConfigData;
    var sPricePlan = oData.pricePlan;
    var fDiscountRate = parseFloat(oData.discountRate) / 100 || 0;
    var aTableData = oData.tableData;
    var sDeliveryDate = oData.deliveryDate || "15.09.2025"; // Default delivery date (Q3 2025)
    var oDeliveryDate = new Date(sDeliveryDate.split(".").reverse().join("-")); // Convert DD.MM.YYYY to YYYY-MM-DD
    var iDeliveryYear = oDeliveryDate.getFullYear(); // 2025
    var iCurrentYear = new Date().getFullYear(); // 2025
    var iCurrentMonth = new Date().getMonth() + 1; // 8 (August)
    var iRelativeDeliveryColumn = iDeliveryYear - iCurrentYear; // e.g., 0 (2025 - 2025)
    var iDeliveryMonth = oDeliveryDate.getMonth() + 1; // 9 (September)
    var sDeliveryPeriod = this._getPeriodForDate(oConfigData.frequency, iDeliveryMonth); // e.g., Q3
    var iStartPeriodIndex = this._getStartPeriodIndex(oConfigData.frequency, iCurrentMonth); // e.g., 2 for Q3
    var sDownpaymentPeriod = this._getPeriodForDate(oConfigData.frequency, iCurrentMonth); // e.g., Q3

    console.log("Sales Model Data:", oData);
    console.log("Config Data:", oConfigData);
    console.log("Table Data Periods and col0:", aTableData.map(row => ({ period: row.period, col0: row.col0 })));

    if (!sPricePlan || !oData.unitNpv || !oData.discountRate || aTableData.length === 0 || !oData.project.projectId) {
        sap.m.MessageToast.show("Please fill in Unit NPV, Discount Rate, Price Plan, Project, and table data before simulating.");
        return;
    }

    var iPricePlanYears = parseInt(sPricePlan.replace("YP", "")) || 1; // e.g., 3 for 3YP
    var iColumns = iPricePlanYears + (iStartPeriodIndex > 0 ? 1 : 0); // e.g., 4 for Q3 start
    iColumns = Math.max(iColumns, iRelativeDeliveryColumn + 1); // Ensure delivery year is included
    var iPeriodsPerYear = this._getRowCount(oConfigData.frequency); // e.g., 4 for quarters

    // Get configured percentages
    var fConfigDownpayment = oConfigData.periods.find(p => p.period.toLowerCase() === "downpayment")?.totalPercentage || 0;
    var fConfigDelivery = oConfigData.periods.find(p => p.period.toLowerCase() === "delivery")?.totalPercentage || 0;
    var aConfigPercentages = Array(iPricePlanYears).fill(0);
    oConfigData.periods.forEach(p => {
        if (p.period.toLowerCase().includes("yp")) {
            var iYearIndex = parseInt(p.period.replace("YP", "")) - 1;
            if (iYearIndex >= 0 && iYearIndex < iPricePlanYears) {
                aConfigPercentages[iYearIndex] = p.totalPercentage || 0;
            }
        }
    });
    console.log("Configured Percentages:", { fConfigDownpayment, fConfigDelivery, aConfigPercentages });

    // Extract Downpayment, Contract Payment, and Delivery Payment
    var fDownpayment = 0;
    var fContractpayment = 0;
    var fDeliveryPayment = 0;
    aTableData.forEach(function(oRow, index) {
        console.log("Row Data:", oRow);
        if (oRow.period.toLowerCase() === "downpayment" || (index === 0 && oRow.period.toLowerCase().includes("downpayment"))) {
            fDownpayment = parseFloat(oRow.col0) || 0;
            console.log("Downpayment Percentage:", fDownpayment);
        }
        if (oRow.period.toLowerCase() === "contract payment" || (index === 1 && oRow.period.toLowerCase().includes("contract payment"))) {
            fContractpayment = parseFloat(oRow.col0) || 0;
            console.log("Contract Payment Percentage:", fContractpayment);
        }
        if (oRow.period.toLowerCase() === "delivery payment") {
            var fValue = parseFloat(oRow[`col${iRelativeDeliveryColumn}`]) || 0;
            fDeliveryPayment = fValue;
            console.log("Delivery Payment Percentage:", fDeliveryPayment);
        }
    });

    // Validate Downpayment
    if (fDownpayment + fContractpayment < fConfigDownpayment) {
        sap.m.MessageToast.show(`Error: Downpayment (${fDownpayment.toFixed(2)}%) is less than configured Downpayment (${fConfigDownpayment.toFixed(2)}%) for Year 1 of project ${oData.project.projectId}.`);
        return;
    }

    // Validate Delivery Payment (cumulative up to delivery period)
    var fCumulativeDelivery = 0;
    if (iRelativeDeliveryColumn >= 0 && iRelativeDeliveryColumn < iColumns) {
        // Build totals per column up to the delivery column
        var aColumnTotalsUpToDelivery = Array(iRelativeDeliveryColumn + 1).fill(0);
        aTableData.forEach(function(oRow) {
            for (var j = 0; j <= iRelativeDeliveryColumn; j++) {
                aColumnTotalsUpToDelivery[j] += parseFloat(oRow[`col${j}`]) || 0;
            }
        });
        // Build cumulative across those columns
        var aCumulativeCols = [];
        aColumnTotalsUpToDelivery.reduce(function(acc, val, idx) {
            acc += val;
            aCumulativeCols[idx] = acc;
            return acc;
        }, 0);
        fCumulativeDelivery = aCumulativeCols[iRelativeDeliveryColumn] || 0;
    } else {
        // fallback: sum all columns then cumulative
        var aColumnTotalsAll = Array(iColumns).fill(0);
        aTableData.forEach(function(oRow) {
            for (var j = 0; j < iColumns; j++) {
                aColumnTotalsAll[j] += parseFloat(oRow[`col${j}`]) || 0;
            }
        });
        var aCumulativeAll = [];
        aColumnTotalsAll.reduce(function(acc, val, idx) {
            acc += val;
            aCumulativeAll[idx] = acc;
            return acc;
        }, 0);
        fCumulativeDelivery = aCumulativeAll.length ? aCumulativeAll[aCumulativeAll.length - 1] : 0;
    }

    console.log("Cumulative Delivery Percentage:", fCumulativeDelivery);
    if (fCumulativeDelivery < fConfigDelivery) {
        sap.m.MessageToast.show(`Error: Cumulative payments up to ${sDeliveryPeriod} ${iDeliveryYear} (${fCumulativeDelivery.toFixed(2)}%) are less than configured Delivery percentage (${fConfigDelivery.toFixed(2)}%) for project ${oData.project.projectId}.`);
        return;
    }

        // Calculate yearly and cumulative totals for 12-month periods
    var aSalesTotals = Array(iColumns).fill(0);
    var aCumulativeTotals = Array(iPricePlanYears).fill(0);
    aTableData.forEach(function(oRow) {
        if (oRow.period.toLowerCase() === "downpayment" || oRow.period.toLowerCase() === "contract payment") {
            var fValue = parseFloat(oRow.col0) || 0;
            aSalesTotals[0] += fValue;
            aCumulativeTotals[0] += fValue;
            console.log(`Row ${oRow.period}, Year ${iCurrentYear}, Plan Year 1, Value: ${fValue}`);
        } else if (oRow.period.toLowerCase() === "delivery payment") {
            if (iRelativeDeliveryColumn >= 0 && iRelativeDeliveryColumn < iColumns) {
                var fValue = parseFloat(oRow[`col${iRelativeDeliveryColumn}`]) || 0;
                aSalesTotals[iRelativeDeliveryColumn] += fValue;
                var iDeliveryPeriodIndex = this._getPeriods(oConfigData.frequency).indexOf(sDeliveryPeriod);
                var iGlobalDelivery = iRelativeDeliveryColumn * iPeriodsPerYear + iDeliveryPeriodIndex;
                var iYearIndex = Math.floor(iGlobalDelivery / iPeriodsPerYear) - 1;
                if (iYearIndex < 0) iYearIndex = 0;
                if (iYearIndex >= 0 && iYearIndex < iPricePlanYears) {
                    aCumulativeTotals[iYearIndex] += fValue;
                }
                console.log(`Row ${oRow.period}, Year ${iRelativeDeliveryColumn + iCurrentYear}, Plan Year ${iYearIndex + 1}, Value: ${fValue}`);
            }
        } else {
            for (var j = 0; j < iColumns; j++) {
                var iPeriodIndex = this._getPeriods(oConfigData.frequency).indexOf(oRow.period); // e.g., Q4 = 3
                if (iPeriodIndex >= 0) {
                    var iGlobalPeriodIndex = j * iPeriodsPerYear + iPeriodIndex; // e.g., Q1 2026 = 1*4 + 0 = 4
                    var iYearIndex = Math.floor(iGlobalPeriodIndex / iPeriodsPerYear) - 1;
                    if (iYearIndex < 0) iYearIndex = 0;
                    if (iYearIndex >= 0 && iYearIndex < iPricePlanYears) {
                        var fValue = parseFloat(oRow[`col${j}`]) || 0;
                        aSalesTotals[j] += fValue;
                        aCumulativeTotals[iYearIndex] += fValue;
                        console.log(`Row ${oRow.period}, Year ${j + iCurrentYear}, Plan Year ${iYearIndex + 1}, Value: ${fValue}`);
                    }
                }
            }
        }
    }, this);

    // Make cumulative totals include previous years
    for (var year = 1; year < iPricePlanYears; year++) {
        aCumulativeTotals[year] += aCumulativeTotals[year - 1];
    }

    // Validate cumulative yearly totals for 12-month periods
    for (var year = 0; year < iPricePlanYears; year++) {
        if (aCumulativeTotals[year] < aConfigPercentages[year]) {
            sap.m.MessageToast.show(`Error: Cumulative total percentage for Year ${year + 1} (${aCumulativeTotals[year].toFixed(2)}%) is less than configured percentage (${aConfigPercentages[year].toFixed(2)}%) for project ${oData.project.projectId}.`);
            return;
        }
    }

    // Validate total percentage equals 100%
    var fTotalPercentage = 0;
    aTableData.forEach(function(oRow) {
        for (var j = 0; j < iColumns; j++) {
            fTotalPercentage += parseFloat(oRow[`col${j}`]) || 0;
        }
    });
    if (fTotalPercentage !== 100) {
        sap.m.MessageToast.show(`Error: Total percentage (${fTotalPercentage.toFixed(2)}%) does not equal 100% for project ${oData.project.projectId}.`);
        return;
    }

    // Calculate Future Value and amounts
            var fUnitNpv = parseFloat(oData.unitNpv) || 0;
            var iTotalPeriods = iPricePlanYears * iPeriodsPerYear;
            var aE = Array(iTotalPeriods).fill(0); // Initialize aE with exact size
            aTableData.forEach(function(oRow) {
                if (oRow.period.toLowerCase() !== "downpayment" && oRow.period.toLowerCase() !== "delivery payment" && oRow.period.toLowerCase() !== "contract payment") {
                    var iPeriodIndex = this._getPeriods(oConfigData.frequency).indexOf(oRow.period); // e.g., Q3 = 2
                    if (iPeriodIndex >= 0) {
                        for (var j = 0; j < iColumns; j++) {
                            var iGlobalPeriodIndex = j * iPeriodsPerYear + iPeriodIndex; // e.g., Q3 2026 = 1*4 + 2 = 6
                            var iYearIndex = Math.floor(iGlobalPeriodIndex / iPeriodsPerYear) - 1; // Map to plan year
                            if (iYearIndex < 0) iYearIndex = 0; // Treat early periods as Year 1
                            if (iYearIndex >= 0 && iYearIndex < iPricePlanYears) {
                                var iPlanPeriodIndex = iYearIndex * iPeriodsPerYear + iPeriodIndex; // e.g., Q3 Year 1 = 0*4 + 2 = 2
                                if (iPlanPeriodIndex < iTotalPeriods) {
                                    var fBaseValue = (parseFloat(oRow[`col${j}`]) || 0) / 100; // Convert to decimal
                                    aE[iPlanPeriodIndex] += fBaseValue; // Accumulate in correct position
                                    console.log(`E Calc Year ${j + iCurrentYear}, Period ${oRow.period}, Plan Period ${iPlanPeriodIndex}:`, { basePercentage: fBaseValue });
                                }
                            }
                        }
                    }
                }
            }, this);

            // Calculate NPV with full precision
            const discountFactor = (1 + fDiscountRate) ** (1 / iPeriodsPerYear) - 1;
            let fNpv = 0;
            for (let i = 0; i < aE.length; i++) {
                fNpv += aE[i] / (1 + discountFactor) ** (i + 1);
            }
            fNpv += (fDownpayment + fContractpayment + fDeliveryPayment) / 100; // Convert to decimal, include all payments

            // Calculate Future Value
            var fFutureValue = fUnitNpv * (1 / fNpv);


    // Calculate amounts with proper formatting
    aTableData.forEach(function(oRow) {
        for (var i = 0; i < iColumns; i++) { // Adjust based on your column count
            var fPercentage = parseFloat(oRow[`col${i}`]) || 0;
            var fAmount = (fPercentage / 100) * fFutureValue;
            oRow[`amountCol${i}`] = fAmount > 0 ? this._formatEGP(fAmount) : "";
        }
    }.bind(this));

    // Format for display
    var fNpvDisplay = fNpv.toFixed(6);
    var fFutureValueDisplay = fFutureValue.toFixed(2);

    // Update model with display values
    oSalesModel.setProperty("/futureValue", this._formatEGP(fFutureValue));
    // oSalesModel.setProperty("/futureValue", fFutureValueDisplay);
    oSalesModel.setProperty("/npv", fNpvDisplay);
    oSalesModel.setProperty("/tableData", aTableData); // Ensure tableData is updated
    oSalesModel.refresh(true); // Force refresh
    sap.m.MessageToast.show(`Simulation completed: Future Value = ${fFutureValueDisplay}, NPV = ${fNpvDisplay}`);
    console.log("Frequency:", oConfigData.frequency, 
                "Periods per Year:", iPeriodsPerYear, 
                "E Array:", aE, 
                "Downpayment:", fDownpayment, 
                "Contract Payment:", fContractpayment, 
                "Delivery Payment:", fDeliveryPayment, 
                "Cumulative Delivery:", fCumulativeDelivery,
                "Cumulative Totals:", aCumulativeTotals,
                "NPV (full precision):", fNpv, 
                "NPV (display):", fNpvDisplay, 
                "Future Value (full precision):", fFutureValue, 
                "Future Value (display):", fFutureValueDisplay);
    oSalesModel.setProperty("/isSimulationDone", true);
},
onSendToCX: function() {
    // 1. Prevent multiple simultaneous sends
    if (this._isSending) {
        sap.m.MessageToast.show("Send operation is already in progress. Please wait...");
        return;
    }

    // 2. Prevent rapid clicking (3 second cooldown)
    var currentTime = Date.now();
    if (currentTime - this._lastSendTime < 3000) {
        sap.m.MessageToast.show("Please wait a moment before sending again");
        return;
    }

    // 3. Check if simulation was performed
    var oSalesModel = this.getView().getModel("sales");
    var isSimulationDone = oSalesModel.getProperty("/isSimulationDone");
    
    if (!isSimulationDone) {
        sap.m.MessageBox.warning("Please run the simulation first before sending to CX.", {
            title: "Simulation Required",
            actions: [sap.m.MessageBox.Action.OK]
        });
        return;
    }

    // 4. Validate required data
    var oData = oSalesModel.getData();
    var aMissingFields = [];
    
    if (!oData.futureValue || oData.futureValue === "") aMissingFields.push("Future Value");
    if (!oData.npv || oData.npv === "") aMissingFields.push("NPV");
    if (!oData.leadId || oData.leadId === "") aMissingFields.push("Lead ID");
    if (!oData.psId || oData.psId === "") aMissingFields.push("PS ID");
    if (!oData.pcId || oData.pcId === "") aMissingFields.push("PC ID");
    if (!oData.unitId || oData.unitId === "") aMissingFields.push("Unit ID");
    if (!oData.project.projectId || oData.project.projectId === "") aMissingFields.push("Project ID");
    
    if (aMissingFields.length > 0) {
        sap.m.MessageBox.error("Missing required fields: " + aMissingFields.join(", "), {
            title: "Validation Error",
            actions: [sap.m.MessageBox.Action.OK]
        });
        return;
    }

    // 5. Validate table data has meaningful content
    var aTableData = oData.tableData || [];
    var hasValidData = false;
    var totalPercentage = 0;
    
    aTableData.forEach(function(oRow) {
        for (var key in oRow) {
            if (key.startsWith("col") && parseFloat(oRow[key]) > 0) {
                hasValidData = true;
                totalPercentage += parseFloat(oRow[key]) || 0;
            }
        }
    });
    
    if (!hasValidData) {
        sap.m.MessageBox.warning("Please enter payment schedule data before sending to CX.", {
            title: "No Payment Data",
            actions: [sap.m.MessageBox.Action.OK]
        });
        return;
    }
    
    if (Math.abs(totalPercentage - 100) > 0.01) {
        sap.m.MessageBox.warning("Payment schedule must total 100%. Current total: " + totalPercentage.toFixed(2) + "%", {
            title: "Invalid Payment Schedule",
            actions: [sap.m.MessageBox.Action.OK]
        });
        return;
    }

    // 6. Confirm action (especially important for external system calls)
    sap.m.MessageBox.confirm("Are you sure you want to send this payment plan to CX? This action cannot be undone.", {
        title: "Confirm Send to CX",
        actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.CANCEL],
        onClose: function(sAction) {
            if (sAction === sap.m.MessageBox.Action.YES) {
                this._executeSendToCX();
            }
        }.bind(this)
    });
},

_executeSendToCX: function() {
    // Set sending state
    this._isSending = true;
    this._lastSendTime = Date.now();
    this._updateSendButtonState();

    var oSalesModel = this.getView().getModel("sales");
    var oData = oSalesModel.getData();
    var sProjectType = oData.projectType || "";
    var sSuffix = sProjectType.toLowerCase().includes("NUCA") ? "C" : "N";

    // Helper function to strip thousand separators and EGP suffix
    var stripFormat = function(sValue) {
        if (!sValue || sValue === "") return "0";
        // Remove thousand separators (commas), EGP suffix, and trim
        return sValue.replace(/,/g, "").replace(" EGP", "");
    };

    // Construct the payment plan for the first iFlow
    var aConditions = [];
    var aTableData = oData.tableData || [];
    var iYears = parseInt(oData.pricePlan.replace("YP", "")) || 1;
    var iDeliveryYear = new Date(oData.deliveryDate).getFullYear() - new Date().getFullYear();
    var oConfigData = this._oConfigData || { frequency: "Annual" };

    // Determine frequency-based values for Installments
    var sFrequency = oConfigData.frequency || "Annual";
    var sCalcMethod, iDueInMonth;
    switch (sFrequency) {
        case "Monthly":
            sCalcMethod = "Z02";
            iDueInMonth = 1;
            break;
        case "Quarter":
            sCalcMethod = "Z03";
            iDueInMonth = 3;
            break;
        case "Semi":
            sCalcMethod = "Z04";
            iDueInMonth = 6;
            break;
        case "Annual":
        default:
            sCalcMethod = "Z05";
            iDueInMonth = 12;
            break;
    }

    // Count non-zero installments
    var iInstallmentCount = 0;
    aTableData.forEach(function(oRow) {
        if (oRow.period !== "Downpayment" && oRow.period !== "Contract Payment" && oRow.period !== "Delivery Payment" && oRow.period !== "") {
            for (var i = 0; i < iYears; i++) {
                if (parseFloat(oRow["col" + i]) > 0) {
                    iInstallmentCount++;
                }
            }
        }
    });

    // 1. Downpayment
    var fDownpaymentPercentage = 0;
    aTableData.forEach(function(oRow) {
        if (oRow.period === "Downpayment") {
            fDownpaymentPercentage = parseFloat(oRow.col0) || 0;
        }
    });
    aConditions.push({
        conditionType: "Z" + sSuffix + "01",
        conditionPercentage: fDownpaymentPercentage.toFixed(2),
        conditionBasePrice: "ZTP",
        conditionCalcMethod: "Z01",
        conditionFrequency: "Z01",
        conditionDueInMonth: "1",
        conditionInstallments: "1",
        conditionnoYears: "1"
    });

    // 2. Contract Payment
    var fContractPercentage = 0;
    aTableData.forEach(function(oRow) {
        if (oRow.period === "Contract Payment") {
            fContractPercentage = parseFloat(oRow.col0) || 0;
        }
    });
    aConditions.push({
        conditionType: "Z" + sSuffix + "03",
        conditionPercentage: fContractPercentage.toFixed(2),
        conditionBasePrice: "ZTP",
        conditionCalcMethod: "Z01",
        conditionFrequency: "Z01",
        conditionDueInMonth: "1",
        conditionInstallments: "1",
        conditionnoYears: "1"
    });

    // 3. Delivery Payment
    var fDeliveryPercentage = 0;
    aTableData.forEach(function(oRow) {
        if (oRow.period === "Delivery Payment") {
            fDeliveryPercentage = parseFloat(oRow["col" + iDeliveryYear]) || 0;
        }
    });
    aConditions.push({
        conditionType: "Z" + sSuffix + "05",
        conditionPercentage: fDeliveryPercentage.toFixed(2),
        conditionBasePrice: "ZTP",
        conditionCalcMethod: "Z01",
        conditionFrequency: "Z01",
        conditionDueInMonth: "1",
        conditionInstallments: "1",
        conditionnoYears: "1"
    });

    // 4. Installments
    var fInstallmentTotal = 0;
    aTableData.forEach(function(oRow) {
        if (oRow.period !== "Downpayment" && oRow.period !== "Contract Payment" && oRow.period !== "Delivery Payment" && oRow.period !== "") {
            for (var i = 0; i <= iYears; i++) {
                fInstallmentTotal += parseFloat(oRow["col" + i]) || 0;
            }
        }
    });
    aConditions.push({
        conditionType: "Z" + sSuffix + "02",
        conditionPercentage: fInstallmentTotal.toFixed(2),
        conditionBasePrice: "ZTP",
        conditionCalcMethod: sCalcMethod,
        conditionFrequency: sCalcMethod,
        conditionDueInMonth: iDueInMonth.toString(),
        conditionInstallments: iInstallmentCount.toString(),
        conditionnoYears: iYears.toString()
    });

    // Construct the final payload for the first iFlow
    var oPayloadFirst = {
        custompaymentPlan: [{
            leadID: oData.leadId || "",
            pcID: oData.pcId || "",
            unitID: oData.unitId || "",
            projectID: oData.project.projectId || "",
            finaPriceAmount: stripFormat(oData.futureValue),
            currency: "EGP",
            noOfYears: oData.pricePlan,
            Conditions: aConditions
        }]
    };

    var oModel = this.getOwnerComponent().getModel("cpiModel");
    if (!oModel) {
        console.error("cpiModel is undefined:", oModel);
        sap.m.MessageBox.error("CPI model is not available. Please contact system administrator.", {
            title: "System Error"
        });
        this._resetSendState();
        return;
    }

    // Execute the first iFlow with enhanced error handling
    var oContextFirst = oModel.bindContext("/sendToCX(...)");
    oContextFirst.setParameter("payload", JSON.stringify(oPayloadFirst));
    oContextFirst.setParameter("environment", oData.tenant);
    var that = this;
    
    oContextFirst.execute().then(function(oResult) {
        var oDataFirst = oContextFirst.getBoundContext().getObject();
        console.log("Response from first CPI:", oDataFirst);

        // Parse XML response to extract versionPlan
        var sXmlResponse = oDataFirst.result;
        var sVersionPlan = "";
        
        if (sXmlResponse && typeof sXmlResponse === 'string') {
            // Remove escaped quotes and parse XML
            var sCleanXml = sXmlResponse.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            
            // Extract versionPlan using regex
            var versionMatch = sCleanXml.match(/<versionPlan>(.*?)<\/versionPlan>/);
            if (versionMatch && versionMatch[1]) {
                sVersionPlan = versionMatch[1];
                console.log("Extracted versionPlan:", sVersionPlan);
            }
        }
        
        // Store versionPlan in the sales model
        var oSalesModel = that.getView().getModel("sales");
        oSalesModel.setProperty("/versionPlan", sVersionPlan);
        
        // Continue with second iFlow...
        that._executeSecondFlow(oData, oDataFirst,oData.tenant);
        
    }).catch(function(oError) {
        console.error("Error from first CPI:", oError);
        sap.m.MessageBox.error("Failed to send payment plan to CX: " + (oError.message || "Unknown error"), {
            title: "Send Error",
            details: oError.responseText || "Please try again or contact support if the problem persists."
        });
        that._resetSendState();
    });
},

_executeSecondFlow: function(oData, oFirstFlowResult, sTenant) {
    var that = this;
    var oModel = this.getOwnerComponent().getModel("cpiModel");
    var oConfigData = this._oConfigData || { frequency: "Annual" };
    var sFrequency = oConfigData.frequency || "Annual";
    var aTableData = oData.tableData || [];
    var iYears = parseInt(oData.pricePlan.replace("YP", ""));
    var iDeliveryYear = new Date(oData.deliveryDate).getFullYear() - new Date().getFullYear();
    
    // Prepare payload for the new iFlow
    var aNewData = [];
    var iCurrentYear = new Date().getFullYear(); // 2025
    var sToday = new Date().toISOString().split('T')[0]; // 2025-08-13
    var sDeliveryDate = oData.deliveryDate; // e.g., "2025-08-13"
    var oCurrentDate = new Date(); // August 13, 2025, 02:42 PM EEST
    var iCurrentMonth = oCurrentDate.getMonth(); // 7 (August, 0-based)

        // Helper function to strip thousand separators and EGP suffix
    var stripFormat = function(sValue) {
        if (!sValue || sValue === "") return "0";
        // Remove thousand separators (commas), EGP suffix, and trim
        return sValue.replace(/,/g, "").replace(" EGP", "");
    };

    // Define period start months (second month of each period)
    var aPeriodMonths;
    if (sFrequency === "Quarter") {
        aPeriodMonths = [
            { period: "Q1", month: 0 }, // February
            { period: "Q2", month: 3 }, // May
            { period: "Q3", month: 6 }, // August
            { period: "Q4", month: 9 } // November
        ];
    } else if (sFrequency === "Semi") {
        aPeriodMonths = [
            { period: "H1", month: 0 }, // February
            { period: "H2", month: 6 }  // August
        ];
    } else if (sFrequency === "Monthly") {
        aPeriodMonths = [
            { period: "Jan", month: 0 }, { period: "Feb", month: 1 }, { period: "Mar", month: 2 },
            { period: "Apr", month: 3 }, { period: "May", month: 4 }, { period: "Jun", month: 5 },
            { period: "Jul", month: 6 }, { period: "Aug", month: 7 }, { period: "Sep", month: 8 },
            { period: "Oct", month: 9 }, { period: "Nov", month: 10 }, { period: "Dec", month: 11 }
        ];
    } else {
        aPeriodMonths = [{ period: "Annual", month: 7 }]; // Default to August for Annual
    }

    var sProjectType = oData.projectType || "";
    var sSuffix = sProjectType.toLowerCase().includes("NUCA") ? "C" : "N";

    // 1. Downpayment
    var fDownpaymentAmount = 0;
    aTableData.forEach(function(oRow) {
        if (oRow.period === "Downpayment") {
            fDownpaymentAmount = stripFormat(oRow.amountCol0);
            if (fDownpaymentAmount > 0) {
                aNewData.push({
                    conditionType: "Z" + sSuffix + "01",
                    dueDate: sToday,
                    Amount: fDownpaymentAmount.toString(),
                    Currency: "EGP"
                });
            }
        }
    });

    // 2. Contract Payment
    var fContractAmount = 0;
    aTableData.forEach(function(oRow) {
        if (oRow.period === "Contract Payment") {
            fContractAmount = stripFormat(oRow.amountCol0);
            if (fContractAmount > 0) {
                var oContractDate = new Date(); // August 13, 2025
                if (sFrequency === "Quarter") {
                    oContractDate.setMonth(oContractDate.getMonth() + 3); // Add 3 months for Quarterly
                }                    
                var sContractDueDate = oContractDate.toISOString().split('T')[0]; // 2025-10-22
                aNewData.push({
                    conditionType: "Z" + sSuffix + "03",
                    dueDate: sContractDueDate,
                    Amount: fContractAmount.toString(),
                    Currency: "EGP"
                });
            }
        }
    });

    // 3. Delivery Payment
    var fDeliveryAmount = 0;
    aTableData.forEach(function(oRow) {
        if (oRow.period === "Delivery Payment") {
            fDeliveryAmount = stripFormat(oRow["amountCol" + iDeliveryYear]);
            if (fDeliveryAmount > 0) {
                aNewData.push({
                    conditionType: "Z" + sSuffix + "05",
                    dueDate: oData.deliveryDate,
                    Amount: fDeliveryAmount.toString(),
                    Currency: "EGP"
                });
            }
        }
    });

    // 4. Installments
    var aPeriods = this._getPeriods(sFrequency); // Get period labels
    var iStartPeriodIndex = this._getStartPeriodIndex(sFrequency, iCurrentMonth); // 1-based month
    var aFilteredPeriods = sFrequency === "Quarter" ? aPeriods.slice(iStartPeriodIndex) :
                          sFrequency === "Semi" ? aPeriods.slice(iStartPeriodIndex) :
                          sFrequency === "Monthly" ? aPeriods.slice(iCurrentMonth) : aPeriods; // Start from current period
    console.log("Adjusted periods for 2025:", aFilteredPeriods); // Debug

    aTableData.forEach(function(oRow) {
        if (oRow.period !== "Downpayment" && oRow.period !== "Contract Payment" && oRow.period !== "Delivery Payment" && oRow.period !== "") {
            for (var i = 0; i <= iYears; i++) {
                var fAmount = stripFormat(oRow["amountCol" + i]);
                if (fAmount > 0) {
                    var iPeriodIndex = (i === 0 && (sFrequency === "Quarter" || sFrequency === "Semi" || sFrequency === "Monthly")) ? aFilteredPeriods.indexOf(oRow.period) : aPeriods.indexOf(oRow.period);
                    if (iPeriodIndex >= 0) {
                        var oDueDate = new Date(oCurrentDate);
                        var iYearOffset = i; // Year offset from 2025
                        var oPeriod = aPeriodMonths.find(p => p.period === (i === 0 && (sFrequency === "Quarter" || sFrequency === "Semi" || sFrequency === "Monthly") ? aFilteredPeriods[iPeriodIndex] : aPeriods[iPeriodIndex]));
                        var iMonth = oPeriod.month; // Start with period's base month
                        if (sFrequency === "Quarter") {
                            var iCurrentMonthInQuarter = iCurrentMonth % 3; // e.g., Sep (8) → 2 in Q3
                            iMonth += iCurrentMonthInQuarter; // Add offset (e.g., Q4 month 9 + 2 = 11)
                            if (iMonth >= 12) {
                                iMonth -= 12; // Wrap around if exceeds December
                                iYearOffset += 1; // Move to next year
                            }
                            if (i === 0 && iMonth <= iCurrentMonth) {
                                // If month is at or before current month in first year, move to next year
                                iYearOffset += 1;
                            }
                        }
                        oDueDate.setFullYear(new Date().getFullYear() + iYearOffset);
                        oDueDate.setMonth(iMonth);
                        var sDueDate = oDueDate.toISOString().split('T')[0]; // YYYY-MM-DD
                        console.log("Period:", oRow.period, "Year:", new Date().getFullYear() + iYearOffset, "Due Date:", sDueDate, "iMonth:", iMonth); // Debug
                        aNewData.push({
                            conditionType: "Z" + sSuffix + "02",
                            dueDate: sDueDate,
                            Amount: fAmount.toString(),
                            Currency: "EGP"
                        });
                    }
                }
            }
        }
    }.bind(this));

    var oPayloadNew = {
        custompaymentSimulation: [{
            customPsID: oData.psId,
            finalPrice: stripFormat(oData.futureValue), // Use raw value for API
            PlanID: oData.versionPlan,
            Data: aNewData
        }]
    };

    // Execute the second iFlow with tenant parameter
    var oContextNew = oModel.bindContext("/sendToNewCX(...)");
    oContextNew.setParameter("payload", JSON.stringify(oPayloadNew));
    oContextNew.setParameter("environment", sTenant);
    
    oContextNew.execute().then(function(oResultNew) {
        var oDataNew = oContextNew.getBoundContext().getObject();
        console.log("Response from new CPI:", oDataNew);
        console.log("Used tenant/environment:", sTenant);
        
        // Success - both flows completed
        sap.m.MessageBox.success(`Payment plan and simulation sent to CX (${sTenant}) successfully!`, {
            title: "Success"
        });
        
        that._hasBeenSentSuccessfully = true;
        that._resetSendState();
        
    }).catch(function(oErrorNew) {
        console.error("Error from new CPI:", oErrorNew);
        sap.m.MessageBox.error(`Payment plan was sent, but simulation failed (${sTenant}): ${oErrorNew.message || "Unknown error"}`, {
            title: "Partial Success",
            details: "The payment plan was successfully sent, but the simulation data could not be transmitted."
        });
        that._resetSendState();
    });
},

_updateSendButtonState: function() {
    var oSendButton = this.byId("sendToCXButton");
    if (oSendButton) {
        oSendButton.setEnabled(!this._isSending);
        oSendButton.setText(this._isSending ? "Sending..." : "Send to CX");
        
        if (this._isSending) {
            oSendButton.setType("Emphasized");
        } else {
            oSendButton.setType("Default");
        }
    }
},

_resetSendState: function() {
    this._isSending = false;
    this._updateSendButtonState();
}
        
    });
});