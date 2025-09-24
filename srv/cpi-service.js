const cds = require('@sap/cds');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

module.exports = cds.service.impl(function () {
  this.on('sendToCX', async req => {
    const { payload, environment } = req.data;
    
    // Determine destination based on environment parameter
    const destinationName = environment === 'prd' ? 'CPI_PRD' : 'IntegrationSuite';

    try {
      const response = await executeHttpRequest(
        { destinationName: destinationName },
        {
          method: 'POST',
          url: '/http/customPP_BTP_to_CX',
          data: payload,
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': 'fetch'  // Add this to skip CSRF token retrieval
          },
          csrf: false  // Add this to disable CSRF handling
        }
      );

      return { 
        result: JSON.stringify(response.data),
        environment: environment,
        destination: destinationName
      };
    } catch (error) {
      console.error(`Error calling CPI ${environment}:`, error);
      req.error(500, `Error sending to CPI ${environment}: ${error.message}`);
    }
  });

  this.on('sendToNewCX', async req => {
    const { payload, environment } = req.data;

    // Determine destination based on environment parameter
    const destinationName = environment === 'prd' ? 'CPI_PRD' : 'IntegrationSuite';

    try {
      const response = await executeHttpRequest(
        { destinationName: destinationName },
        {
          method: 'POST',
          url: '/http/customPS_BTP_to_CX',
          data: payload,
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': 'fetch'  // Add this to skip CSRF token retrieval
          },
          csrf: false  // Add this to disable CSRF handling
        }
      );

      return { 
        result: JSON.stringify(response.data),
        environment: environment,
        destination: destinationName
      };
    } catch (error) {
      console.error(`Error calling new CPI ${environment}:`, error);
      req.error(500, `Error sending to new CPI ${environment}: ${error.message}`);
    }
  });
});