sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/Column",
    "sap/m/Text",
    "sap/m/Input",
    "sap/m/MessageToast"
], function(Controller, JSONModel, Column, Text, Input, MessageToast) {
    "use strict";

    return Controller.extend("project1.controller.Sales", {
        onInit: function() {
            // Get URL parameters
            const oUrlParams = new URLSearchParams(window.location.search);
            const discountRate = oUrlParams.get("discountRate") || "";
            const unitNpv = oUrlParams.get("unitNpv") || "";
            const pricePlan = oUrlParams.get("pricePlan") || "";
            const leadId = oUrlParams.get("leadId") || "";
            const deliveryDate = oUrlParams.get("deliveryDate") || "12.12.2027"; // Default delivery date
        
            // Create or update the sales model with URL parameters
            const oSalesModel = new JSONModel({
                unitNpv: unitNpv,
                discountRate: discountRate,
                leadId: leadId,
                pricePlan: pricePlan,
                project: { projectId: "MQR" }, // Default project
                deliveryDate: deliveryDate, // Initialize delivery date
                tableData: [],
                futureValue: "",
                npv: ""
            });
            this.getView().setModel(oSalesModel, "sales");
        
            // Load distinct configured projects
            var oODataModel = this.getOwnerComponent().getModel("npvModel");
            if (!oODataModel) {
                console.error("OData model not found.");
                MessageToast.show("Error: OData model not available");
                return;
            }
        
            var that = this;
            this._loadDistinctProjects(oODataModel).then(function(aProjects) {
                console.log("Final Distinct Projects for Binding:", aProjects);
                var oProjectSelect = that.byId("projectSelectSales");
                oProjectSelect.setModel(new JSONModel({ projects: aProjects }), "projects");
                oProjectSelect.bindAggregation("items", {
                    path: "projects>/projects",
                    template: new sap.ui.core.Item({
                        key: "{projects>projectId}",
                        text: "{projects>projectId}"
                    })
                });
        
                // Load distinct price plans for the default project
                that._loadDistinctPricePlans(oODataModel, oSalesModel.getProperty("/project/projectId")).then(function(aPricePlans) {
                    console.log("Distinct Price Plans for Default Project:", aPricePlans);
                    var oPricePlanSelect = that.byId("pricePlanSelect");
                    oPricePlanSelect.setModel(new JSONModel({ pricePlans: aPricePlans }), "pricePlans");
                    oPricePlanSelect.bindAggregation("items", {
                        path: "pricePlans>/pricePlans",
                        template: new sap.ui.core.Item({
                            key: "{pricePlans>}",
                            text: "{pricePlans>}"
                        })
                    });
        
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
        
                        oSalesModel.setProperty("/tableData", aTableData);
                        that._oConfigData = oConfigData;
                        that._generateTable();
                    }).catch(function(oError) {
                        console.error("Error loading configuration:", oError);
                        MessageToast.show("Error loading configuration, defaulting to Annual");
                        that._buildTableWithDefault(that.byId("salesTable"), parseInt(oSalesModel.getProperty("/pricePlan").replace("YP", "")) || 1, oSalesModel);
                    });
                }).catch(function(oError) {
                    console.error("Error loading distinct price plans:", oError);
                    MessageToast.show("Error loading price plans");
                });
            }).catch(function(oError) {
                console.error("Error loading distinct projects:", oError);
                MessageToast.show("Error loading projects");
            });
        },

        _loadDistinctPricePlans: function(oODataModel, sProjectId) {
            var that = this;
            return new Promise(function(resolve, reject) {
                if (!oODataModel) {
                    reject("OData model not found");
                    return;
                }

                setTimeout(function() {
                    var oBinding = oODataModel.bindList("/Configurations", null, null, [
                        new sap.ui.model.Filter("project_projectId", sap.ui.model.FilterOperator.EQ, sProjectId)
                    ], { $expand: "periods" });

                    oBinding.requestContexts().then(function(aContexts) {
                        console.log("OData Contexts for Price Plans for Project " + sProjectId + ":", aContexts);
                        if (aContexts.length > 0) {
                            var aAllPeriods = aContexts.reduce(function(aResult, oContext) {
                                var oConfig = oContext.getObject();
                                return aResult.concat((oConfig.periods.results || oConfig.periods || []).map(p => p.orig_period));
                            }, []);
                            var aPricePlans = [...new Set(aAllPeriods)].sort(); // Unique and sorted
                            console.log("Distinct Price Plans for Project " + sProjectId + ":", aPricePlans);
                            resolve(aPricePlans);
                        } else {
                            console.log("No Configurations found for project " + sProjectId + ", returning empty price plan list");
                            resolve([]);
                        }
                    }).catch(function(oError) {
                        console.error("Error loading distinct price plans for project " + sProjectId + ":", oError);
                        reject(oError);
                    });
                }.bind(this), 500); // 500ms delay to allow metadata to load
            });
        },

        onProjectChange: function(oEvent) {
            var sProjectId = oEvent.getParameter("selectedItem").getKey();
            var oSalesModel = this.getView().getModel("sales");
            oSalesModel.setProperty("/project/projectId", sProjectId);

            // Reload price plans for the selected project
            var oODataModel = this.getOwnerComponent().getModel("npvModel");
            var that = this;
            this._loadDistinctPricePlans(oODataModel, sProjectId).then(function(aPricePlans) {
                console.log("Updated Price Plans for Project " + sProjectId + ":", aPricePlans);
                var oPricePlanSelect = that.byId("pricePlanSelect");
                oPricePlanSelect.setModel(new JSONModel({ pricePlans: aPricePlans }), "pricePlans");
                oPricePlanSelect.bindAggregation("items", {
                    path: "pricePlans>/pricePlans",
                    template: new sap.ui.core.Item({
                        key: "{pricePlans>}",
                        text: "{pricePlans>}"
                    })
                });

                // Reload configuration data for the new project
                that._loadDataFromOData(oODataModel).then(function(oConfigData) {
                    console.log("Updated config data for project " + sProjectId + ":", oConfigData);
                    that._oConfigData = oConfigData;
                    var iBaseRows = that._getRowCount(oConfigData.frequency);
                    var iRows = iBaseRows + 3; // Downpayment + Contract Payment
                    var iYears = parseInt(oSalesModel.getProperty("/pricePlan").replace("YP", "")) || 1;
                    var aTableData = that._initializeTableData(iRows, iYears, oConfigData.frequency);
                    oSalesModel.setProperty("/tableData", aTableData);
                    that._generateTable();
                }).catch(function(oError) {
                    console.error("Error loading configuration for project " + sProjectId + ":", oError);
                    MessageToast.show("Error loading configuration");
                });
            }).catch(function(oError) {
                console.error("Error loading distinct price plans for project " + sProjectId + ":", oError);
                MessageToast.show("Error loading price plans");
            });
        },

        onPricePlanChange: function(oEvent) {
            var sPricePlan = oEvent.getParameter("selectedItem").getKey();
            var oSalesModel = this.getView().getModel("sales");
            oSalesModel.setProperty("/pricePlan", sPricePlan);
            this._generateTable();
        },

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

            var iYears = parseInt(sPricePlan.replace("YP", "")) || 1;
            var oODataModel = this.getOwnerComponent().getModel("npvModel");

            if (!oODataModel) {
                console.error("OData model not found.");
                MessageToast.show("Error: OData model not available");
                return;
            }

            var that = this;
            this._loadDataFromOData(oODataModel).then(function(oConfigData) {
                console.log("Loaded config data:", oConfigData);
                if (oConfigData.periods.length > 0) {
                    MessageToast.show("Frequency: " + oConfigData.frequency);
                } else {
                    MessageToast.show("Project is not configured yet");
                }

                var iBaseRows = that._getRowCount(oConfigData.frequency);
                var iRows = iBaseRows + 3; // Downpayment + Contract Payment
                console.log("Row count (including Downpayment and Contract Payment):", iRows);
                var aTableData = that._initializeTableData(iRows, iYears, oConfigData.frequency);

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
                            cells: that._createCells(iYears, oConfigData.frequency, oContext)
                        });
                    }
                });

                oSalesModel.setProperty("/tableData", aTableData);
                that._oConfigData = oConfigData;
            }).catch(function(oError) {
                console.error("Error loading configuration:", oError);
                MessageToast.show("Error loading configuration, defaulting to Annual");
                that._buildTableWithDefault(oTable, iYears, oSalesModel);
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
                var sProjectId = oSalesModel.getProperty("/project/projectId") || "MQR";
        
                setTimeout(function() {
                    var oBinding = oODataModel.bindList("/Configurations", null, null, [
                        new sap.ui.model.Filter("project_projectId", sap.ui.model.FilterOperator.EQ, sProjectId)
                    ], { $expand: "periods" });
        
                    oBinding.requestContexts().then(function(aContexts) {
                        console.log("OData Contexts Retrieved:", aContexts);
                        if (aContexts.length > 0) {
                            var oConfig = aContexts[0].getObject();
                            console.log("Raw OData Response:", JSON.stringify(oConfig, null, 2));
                            var aPeriods = oConfig.periods.results || oConfig.periods || [];
                            var aAggregatedPeriods = [];
        
                            // Initialize array for all years based on orig_period
                            var sMaxOrigPeriod = aPeriods.reduce((max, period) => {
                                return period.orig_period > max ? period.orig_period : max;
                            }, "0YP");
                            var iMaxYears = parseInt(sMaxOrigPeriod.replace("YP", "")) || 1;
        
                            // Map each rel_period to its year, prioritizing self-intersection
                            for (var i = 1; i <= iMaxYears; i++) {
                                var sYearPeriod = i + "YP";
                                var oYearData = { year: i, totalPercentage: 0 };
                                aPeriods.forEach(function(period) {
                                    if (period.rel_period === sYearPeriod) {
                                        oYearData.totalPercentage = parseFloat(period.value) || 0;
                                    } else if (period.orig_period === sYearPeriod && period.rel_period === sYearPeriod) {
                                        oYearData.totalPercentage = parseFloat(period.value) || 0; // Self-intersection takes precedence
                                    }
                                });
                                aAggregatedPeriods.push(oYearData);
                            }
        
                            resolve({
                                frequency: oConfig.frequency,
                                project: { projectId: oConfig.project_projectId || sProjectId },
                                periods: aAggregatedPeriods
                            });
                        } else {
                            console.log("No Configurations found for project " + sProjectId + ", defaulting to empty configuration");
                            resolve({ frequency: "Annual", project: { projectId: sProjectId }, periods: [] });
                        }
                    }).catch(function(oError) {
                        console.error("Error loading Configurations for project " + sProjectId + ":", oError);
                        reject(oError);
                    });
                }.bind(this), 500); // 500ms delay to allow metadata to load
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
            this._oConfigData = { frequency: "Annual", project: { projectId: oSalesModel.getProperty("/project/projectId") || "MQR" }, periods: [] };
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

        onDeliveryDateChange: function(oEvent) {
            var oDatePicker = oEvent.getSource();
            var sNewValue = oDatePicker.getValue(); // Get new date in DD.MM.YYYY format
            var oSalesModel = this.getView().getModel("sales");
            oSalesModel.setProperty("/deliveryDate", sNewValue);
            console.log("Delivery Date changed to:", sNewValue);
            this._generateTable(); // Regenerate table to reflect new delivery year
        },

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

        _createCells: function(iColumns, sFrequency, oContext) {
            var aCells = [new Text({ text: "{sales>period}" })];
            var sPeriod = oContext.getProperty("period");
            var oToday = new Date(); // July 16, 2025
            var iCurrentMonth = oToday.getMonth() + 1; // 7 (July)
            var iCurrentYear = oToday.getFullYear(); // 2025
            var iStartPeriodIndex = this._getStartPeriodIndex(sFrequency, iCurrentMonth);
            var aPeriods = this._getPeriods(sFrequency);
            var oSalesModel = this.getView().getModel("sales");
            var sDeliveryDate = oSalesModel.getProperty("/deliveryDate") || "12.12.2026"; // Default to 12.12.2027
            var oDeliveryDate = new Date(sDeliveryDate.split(".").reverse().join("-")); // Convert DD.MM.YYYY to YYYY-MM-DD
            var iDeliveryYear = oDeliveryDate.getFullYear(); // Get delivery year
            var iRelativeDeliveryColumn = iDeliveryYear - iCurrentYear; // Calculate relative column (0-based)
            var iDeliveryMonth = oDeliveryDate.getMonth() + 1; // Get delivery month (1-12)
            var sDeliveryPeriod = this._getPeriodForDate(sFrequency, iDeliveryMonth); // Get delivery period (e.g., Q4, H2, Dec)
        
            for (let i = 0; i < iColumns; i++) {
                var bVisible = false;
                if (sPeriod === "Downpayment" || sPeriod === "Contract Payment") {
                    bVisible = (i === 0); // Editable only in Year 1
                } else if (sPeriod === "Delivery Payment") {
                    bVisible = (i === iRelativeDeliveryColumn); // Editable only in delivery year column
                } else {
                    bVisible = true; // Other periods are generally visible
                    // Hide periods before the start index in the first column
                    if (i === 0) {
                        var iPeriodIndex = aPeriods.indexOf(sPeriod);
                        if (iPeriodIndex >= 0 && iPeriodIndex < iStartPeriodIndex) {
                            bVisible = false;
                        }
                        // Hide Q3/H2 in first column for current period
                        if ((sFrequency === "Quarter" && sPeriod === "Q3") || (sFrequency === "Semi" && sPeriod === "H2")) {
                            bVisible = false;
                        }
                    }
                    // Hide period in delivery year column if it matches the delivery period
                    if (i === iRelativeDeliveryColumn && sPeriod === sDeliveryPeriod) {
                        bVisible = false;
                    }
                }
                aCells.push(new Input({
                    value: `{sales>col${i}}`,
                    type: "Number",
                    placeholder: "Enter value",
                    visible: bVisible
                }));
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

        onSimulate: function() {
            var oSalesModel = this.getView().getModel("sales");
            var oData = oSalesModel.getData();
            var oConfigData = this._oConfigData || { frequency: "Annual", project: { projectId: oData.project.projectId || "MQR" }, periods: [], downpaymentPercentage: 10, deliveryPercentage: 30 };
            var sPricePlan = oData.pricePlan;
            var fDiscountRate = parseFloat(oData.discountRate) / 100 || 0;
            var aTableData = oData.tableData;
            var sDeliveryDate = oData.deliveryDate || "12.12.2027"; // Default delivery date
            var oDeliveryDate = new Date(sDeliveryDate.split(".").reverse().join("-")); // Convert DD.MM.YYYY to YYYY-MM-DD
            var iDeliveryYear = oDeliveryDate.getFullYear(); // Get delivery year
            var iCurrentYear = new Date().getFullYear(); // 2025
            var iRelativeDeliveryColumn = iDeliveryYear - iCurrentYear; // Delivery year column (0-based)
            var iDeliveryMonth = oDeliveryDate.getMonth() + 1; // Delivery month (1-12)
            var sDeliveryPeriod = this._getPeriodForDate(oConfigData.frequency, iDeliveryMonth); // Delivery period (e.g., Q4)
        
            console.log("Sales Model Data:", oData);
            console.log("Config Data:", oConfigData);
        
            if (!sPricePlan || !oData.unitNpv || !oData.discountRate || aTableData.length === 0 || !oData.project.projectId) {
                MessageToast.show("Please fill in Unit NPV, Discount Rate, Price Plan, Project, and table data before simulating.");
                return;
            }
        
            var iYears = parseInt(sPricePlan.replace("YP", "")) || 1;
            var iPeriodsPerYear = this._getRowCount(oConfigData.frequency);
        
            // Get configured percentages
            var aConfigPercentages = oConfigData.periods.map(p => p.totalPercentage) || Array(iYears).fill(0);
            var fConfigDownpayment = oConfigData.downpaymentPercentage || 10;
            var fConfigDelivery = oConfigData.deliveryPercentage || 30;
        
            // Extract Downpayment, Contract Payment, and Delivery Payment
            var fDownpayment = 0, fContractPayment = 0, fDeliveryPayment = 0;
            aTableData.forEach(function(oRow) {
                console.log("Row Data:", oRow);
                if (oRow.period === "Downpayment") {
                    fDownpayment = parseFloat(oRow.col0) || 0;
                    console.log("Downpayment Percentage:", fDownpayment);
                } else if (oRow.period === "Contract Payment") {
                    fContractPayment = parseFloat(oRow.col0) || 0;
                    console.log("Contract Payment Percentage:", fContractPayment);
                } else if (oRow.period === "Delivery Payment") {
                    fDeliveryPayment = parseFloat(oRow[`col${iRelativeDeliveryColumn}`]) || 0;
                    console.log("Delivery Payment Percentage:", fDeliveryPayment);
                }
            });
        
            // Validate Downpayment + Contract Payment
            var fTotalDownpayment = fDownpayment + fContractPayment;
            if (fTotalDownpayment < fConfigDownpayment) {
                MessageToast.show(`Error: Total Downpayment (${fDownpayment.toFixed(2)}%) and Contract Payment (${fContractPayment.toFixed(2)}%) sum (${fTotalDownpayment.toFixed(2)}%) is less than configured Downpayment (${fConfigDownpayment.toFixed(2)}%) for Year 1 of project ${oData.project.projectId}.`);
                return;
            }
        
            // Validate Delivery Payment
            if (iRelativeDeliveryColumn >= 0 && iRelativeDeliveryColumn < iYears && fDeliveryPayment < fConfigDelivery) {
                MessageToast.show(`Error: Delivery Payment (${fDeliveryPayment.toFixed(2)}%) is less than configured percentage (${fConfigDelivery.toFixed(2)}%) for period ${sDeliveryPeriod} in Year ${iRelativeDeliveryColumn + 1} for project ${oData.project.projectId}.`);
                return;
            }
        
            // Calculate yearly and cumulative totals
            var aSalesTotals = Array(iYears).fill(0);
            var aCumulativeTotals = Array(iYears).fill(0);
            aTableData.forEach(function(oRow) {
                if (oRow.period === "Downpayment" || oRow.period === "Contract Payment") {
                    var fValue = parseFloat(oRow.col0) || 0;
                    aSalesTotals[0] += fValue;
                    aCumulativeTotals[0] += fValue;
                    console.log(`Row ${oRow.period}, Year 1, Value: ${fValue}`);
                } else if (oRow.period === "Delivery Payment") {
                    if (iRelativeDeliveryColumn >= 0 && iRelativeDeliveryColumn < iYears) {
                        var fValue = parseFloat(oRow[`col${iRelativeDeliveryColumn}`]) || 0;
                        aSalesTotals[iRelativeDeliveryColumn] += fValue;
                        aCumulativeTotals[iRelativeDeliveryColumn] += fValue;
                        console.log(`Row ${oRow.period}, Year ${iRelativeDeliveryColumn + 1}, Value: ${fValue}`);
                    }
                } else {
                    for (var j = 0; j < iYears; j++) {
                        var fValue = parseFloat(oRow[`col${j}`]) || 0;
                        aSalesTotals[j] += fValue;
                        if (j === 0) {
                            aCumulativeTotals[j] = aSalesTotals[j];
                        } else {
                            aCumulativeTotals[j] = aCumulativeTotals[j - 1] + aSalesTotals[j];
                        }
                        console.log(`Row ${oRow.period}, Year ${j + 1}, Value: ${fValue}`);
                    }
                }
            });
        
            // Validate cumulative yearly totals
            for (var year = 0; year < iYears; year++) {
                if (aCumulativeTotals[year] < aConfigPercentages[year]) {
                    MessageToast.show(`Error: Cumulative total percentage for Year ${year + 1} (${aCumulativeTotals[year].toFixed(2)}%) is less than configured percentage (${aConfigPercentages[year].toFixed(2)}%) for project ${oData.project.projectId}.`);
                    return;
                }
            }
        
            // Validate total percentage equals 100%
            var fTotalPercentage = fDownpayment + fContractPayment + fDeliveryPayment;
            aTableData.forEach(function(oRow) {
                if (oRow.period !== "Downpayment" && oRow.period !== "Contract Payment" && oRow.period !== "Delivery Payment") {
                    for (var j = 0; j < iYears; j++) {
                        fTotalPercentage += parseFloat(oRow[`col${j}`]) || 0;
                    }
                }
            });
            if (fTotalPercentage !== 100) {
                MessageToast.show(`Error: Total percentage (${fTotalPercentage.toFixed(2)}%) does not equal 100% for project ${oData.project.projectId}.`);
                return;
            }
        
            // Calculate amounts based on unitNpv
            var fUnitNpv = parseFloat(oData.unitNpv) || 0;
            aTableData.forEach(function(oRow, index) {
                oRow.amountCol0 = oRow.col0 ? (parseFloat(oRow.col0) / 100 * fUnitNpv).toFixed(2) : 0;
                oRow.amountCol1 = oRow.col1 ? (parseFloat(oRow.col1) / 100 * fUnitNpv).toFixed(2) : 0;
                oRow.amountCol2 = oRow.col2 ? (parseFloat(oRow.col2) / 100 * fUnitNpv).toFixed(2) : 0;
                console.log(`Row ${oRow.period}, Amounts:`, { amountCol0: oRow.amountCol0, amountCol1: oRow.amountCol1, amountCol2: oRow.amountCol2 });
            });
        
            // Build E array (all years, all periods except Downpayment, Contract Payment, and Delivery Payment)
            var iTotalPeriods = iYears * iPeriodsPerYear;
            var aE = [];
            for (var year = 1; year <= iYears; year++) {
                aTableData.forEach(function(oRow, iRow) {
                    if (oRow.period !== "Downpayment" && oRow.period !== "Contract Payment" && oRow.period !== "Delivery Payment") {
                        var fBaseValue = (parseFloat(oRow[`col${year - 1}`]) || 0) / 100; // Convert to decimal
                        var iPeriodIndex = iRow - 3; // Adjust for three fixed rows
                        if (iPeriodIndex >= 0 && iPeriodIndex < iPeriodsPerYear) {
                            aE.push(fBaseValue);
                            console.log(`E Calc Year ${year}, Period ${oRow.period}:`, { basePercentage: fBaseValue });
                        }
                    }
                });
                while (aE.length < year * iPeriodsPerYear) {
                    aE.push(0);
                }
            }
        
            // Calculate NPV with full precision
            const discountFactor = (1 + fDiscountRate) ** (1 / iPeriodsPerYear) - 1;
            let fNpv = 0;
            for (let i = 0; i < aE.length; i++) {
                fNpv += aE[i] / (1 + discountFactor) ** (i + 1);
            }
            fNpv += (fDownpayment + fContractPayment + fDeliveryPayment) / 100; // Convert to decimal
        
            // Calculate Future Value using full-precision NPV
            var fUnitNpv = parseFloat(oData.unitNpv) || 0;
            var fFutureValue = fUnitNpv * (1 / fNpv);
        
            // Format for display
            var fNpvDisplay = fNpv.toFixed(6);
            var fFutureValueDisplay = fFutureValue.toFixed(2);
        
            // Update model with display values
            oSalesModel.setProperty("/futureValue", fFutureValueDisplay);
            oSalesModel.setProperty("/npv", fNpvDisplay);
            oSalesModel.refresh(); // Ensure model updates are reflected in the UI
            MessageToast.show(`Simulation completed: Future Value = ${fFutureValueDisplay}, NPV = ${fNpvDisplay}`);
            console.log("Frequency:", oConfigData.frequency, 
                        "Periods per Year:", iPeriodsPerYear, 
                        "E Array:", aE, 
                        "Downpayment:", fDownpayment, 
                        "Contract Payment:", fContractPayment, 
                        "Delivery Payment:", fDeliveryPayment, 
                        "NPV (full precision):", fNpv, 
                        "NPV (display):", fNpvDisplay, 
                        "Future Value (full precision):", fFutureValue, 
                        "Future Value (display):", fFutureValueDisplay);
        }
    });
});