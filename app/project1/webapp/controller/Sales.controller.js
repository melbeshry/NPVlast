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
            const discountRate = oUrlParams.get("discountRate") || ""; // e.g., "30.25"
            const unitNpv = oUrlParams.get("unitNpv") || ""; // e.g., "1000000"
            const pricePlan = oUrlParams.get("pricePlan") || ""; // e.g., "7YP"
            const leadId = oUrlParams.get("leadId") || ""; // e.g., "12345"

            // Create or update the sales model with URL parameters
            const oSalesModel = new JSONModel({
                unitNpv: unitNpv,
                discountRate: discountRate,
                leadId: leadId,
                pricePlan: pricePlan,
                tableData: [],
                futureValue: "",
                npv: ""
            });
            this.getView().setModel(oSalesModel, "sales");

            // Existing initialization logic
            var oODataModel = this.getOwnerComponent().getModel("npvModel");

            if (!oODataModel) {
                console.error("OData model not found.");
                MessageToast.show("Error: OData model not available");
                return;
            }

            var that = this;
            this._loadDataFromOData(oODataModel).then(function(oConfigData) {
                console.log("Loaded config data:", oConfigData);
                MessageToast.show("Frequency: " + oConfigData.frequency);

                var iBaseRows = that._getRowCount(oConfigData.frequency);
                var iRows = iBaseRows + 2; // Downpayment + Contract Payment
                console.log("Row count (including Downpayment and Contract Payment):", iRows);
                var aTableData = that._initializeTableData(iRows, parseInt(oSalesModel.getProperty("/pricePlan").replace("YP", "")) || 1, oConfigData.frequency);

                oSalesModel.setProperty("/tableData", aTableData);
                that._oConfigData = oConfigData;
                that._generateTable();
            }).catch(function(oError) {
                console.error("Error loading frequency:", oError);
                MessageToast.show("Error loading frequency, defaulting to Annual");
                that._buildTableWithDefault(that.byId("salesTable"), parseInt(oSalesModel.getProperty("/pricePlan").replace("YP", "")) || 1, oSalesModel);
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
                MessageToast.show("Frequency: " + oConfigData.frequency);

                var iBaseRows = that._getRowCount(oConfigData.frequency);
                var iRows = iBaseRows + 2; // Downpayment + Contract Payment
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
                console.error("Error loading frequency:", oError);
                MessageToast.show("Error loading frequency, defaulting to Annual");
                that._buildTableWithDefault(oTable, iYears, oSalesModel);
            });
        },

        _loadDataFromOData: function(oODataModel) {
            return new Promise(function(resolve, reject) {
                if (!oODataModel) {
                    reject("OData model not found");
                    return;
                }

                oODataModel.bindList("/Configurations", undefined, undefined, undefined, {
                    $expand: "periods($expand=percentages)"
                }).requestContexts().then(function(aContexts) {
                    console.log("OData Contexts Retrieved:", aContexts);
                    if (aContexts.length > 0) {
                        var oConfig = aContexts[0].getObject();
                        console.log("Raw OData Response:", JSON.stringify(oConfig, null, 2));
                        resolve({
                            frequency: oConfig.frequency,
                            periods: oConfig.periods.results || oConfig.periods
                        });
                    } else {
                        console.log("No Configurations found, defaulting to Annual");
                        resolve({ frequency: "Annual", periods: [] });
                    }
                }).catch(function(oError) {
                    console.error("Error loading Configurations:", oError);
                    reject(oError);
                });
            });
        },

        _buildTableWithDefault: function(oTable, iYears, oSalesModel) {
            var iRows = this._getRowCount("Annual") + 2; // Downpayment + Contract Payment
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
            this._oConfigData = { frequency: "Annual", periods: [] };
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
            return ["Downpayment", "Contract Payment"].concat(baseLabels.slice(0, iRows - 2));
        },

        _createCells: function(iColumns, sFrequency, oContext) {
            var aCells = [new Text({ text: "{sales>period}" })];
            var sPeriod = oContext.getProperty("period");
            for (let i = 0; i < iColumns; i++) {
                // Downpayment and Contract Payment only editable in Year 1 (col0)
                var bVisible = (sPeriod !== "Downpayment" && sPeriod !== "Contract Payment") || i === 0;
                aCells.push(new Input({
                    value: `{sales>col${i}}`,
                    type: "Number",
                    placeholder: "Enter value",
                    visible: bVisible
                }));
            }
            return aCells;
        },

        onSimulate: function() {
            var oSalesModel = this.getView().getModel("sales");
            var oData = oSalesModel.getData();
            var oConfigData = this._oConfigData || { frequency: "Annual", periods: [] };
            var sPricePlan = oData.pricePlan;
            var fDiscountRate = parseFloat(oData.discountRate) / 100 || 0;
            var aTableData = oData.tableData;
        
            console.log("Sales Model Data:", oData);
            console.log("Config Data:", oConfigData);
        
            if (!sPricePlan || !oData.unitNpv || !oData.discountRate || aTableData.length === 0) {
                MessageToast.show("Please fill in Unit NPV, Discount Rate, Price Plan, and table data before simulating.");
                return;
            }
        
            var fUnitNpv = parseFloat(oData.unitNpv) || 0;
            var iYears = parseInt(sPricePlan.replace("YP", "")) || 1;
            var iPeriodsPerYear = this._getRowCount(oConfigData.frequency);
        
            // Extract Downpayment (E11) and Contract Payment (E12) as percentages
            var fDownpayment = 0, fContractPayment = 0;
            aTableData.forEach(function(oRow) {
                console.log("Row Data:", oRow);
                if (oRow.period === "Downpayment") {
                    fDownpayment = (parseFloat(oRow.col0) || 0) / 100; // Convert to decimal
                    console.log("Downpayment Percentage:", fDownpayment);
                } else if (oRow.period === "Contract Payment") {
                    fContractPayment = (parseFloat(oRow.col0) || 0) / 100; // Convert to decimal
                    console.log("Contract Payment Percentage:", fContractPayment);
                }
            });
        
            // Build E array (all years, all periods except Downpayment and Contract Payment)
            var iTotalPeriods = iYears * iPeriodsPerYear;
            var aE = [];
            for (var year = 1; year <= iYears; year++) {
                aTableData.forEach(function(oRow, iRow) {
                    if (oRow.period !== "Downpayment" && oRow.period !== "Contract Payment") {
                        var fBaseValue = (parseFloat(oRow[`col${year - 1}`]) || 0) / 100; // Convert to decimal
                        var iPeriodIndex = iRow - 2;
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
            fNpv += fDownpayment + fContractPayment;
        
            // Calculate Future Value using full-precision NPV
            var fFutureValue = fUnitNpv * (1 / fNpv);
        
            // Format for display (e.g., 6 decimal places), but keep full precision for calculations
            var fNpvDisplay = fNpv.toFixed(6); // Adjust to desired display precision
            var fFutureValueDisplay = fFutureValue.toFixed(2); // Keep future value at 2 decimals for display
        
            // Update model with display values
            oSalesModel.setProperty("/futureValue", fFutureValueDisplay);
            oSalesModel.setProperty("/npv", fNpvDisplay);
            MessageToast.show(`Simulation completed: Future Value = ${fFutureValueDisplay}, NPV = ${fNpvDisplay}`);
            console.log("Frequency:", oConfigData.frequency, 
                        "Periods per Year:", iPeriodsPerYear, 
                        "E Array:", aE, 
                        "Downpayment:", fDownpayment, 
                        "Contract Payment:", fContractPayment, 
                        "NPV (full precision):", fNpv, 
                        "NPV (display):", fNpvDisplay, 
                        "Future Value (full precision):", fFutureValue, 
                        "Future Value (display):", fFutureValueDisplay);
        }
    });
});