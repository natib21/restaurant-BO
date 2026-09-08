const TelebirrProvider = require('./TelebirrProvider');
const CBEProvider = require('./CBEProvider');
const CBEBirrProvider = require('./CBEBirrProvider');
const AppError = require('../../../../../utils/appError');

// Singleton instances (can be overridden for testing)
let providers = null;

/**
 * Initialize providers with optional HTTP client override
 * @param {Object} options - { httpClient: mockFetch } for testing
 */
function initializeProviders(options = {}) {
  providers = {
    telebirr: new TelebirrProvider(options),
    cbe: new CBEProvider(options),
    cbebirr: new CBEBirrProvider(options),
  };
  return providers;
}

/**
 * Resolve provider instance by name
 * @param {string} providerName - 'telebirr', 'cbe', or 'cbebirr'
 * @returns {BaseProvider} Provider instance
 */
function resolveProvider(providerName) {
  if (!providers) {
    initializeProviders();
  }
  
  const provider = providers[providerName.toLowerCase()];
  
  if (!provider) {
    throw new AppError(
      `Unknown payment provider: ${providerName}. Supported: telebirr, cbe, cbebirr`,
      400
    );
  }
  
  return provider;
}

module.exports = { resolveProvider, initializeProviders, providers };
