#!/usr/bin/env node

/**
 * TLS Diagnostic Script for Telebirr Payment Gateway
 * 
 * This script tests the TLS certificate configuration of transactioninfo.ethiotelecom.et
 * to determine if automated payment verification can be safely enabled.
 * 
 * Run: node scripts/test-telebirr-tls.js
 */

const https = require('https');
const tls = require('tls');

const TELEBIRR_HOST = 'transactioninfo.ethiotelecom.et';
const TELEBIRR_PORT = 443;

console.log('='.repeat(80));
console.log('Telebirr TLS Diagnostic Test');
console.log('='.repeat(80));
console.log(`\nTesting: https://${TELEBIRR_HOST}:${TELEBIRR_PORT}`);
console.log('\nThis test will check the TLS certificate configuration without bypassing validation.\n');

// Test 1: Standard TLS connection
console.log('Test 1: Standard TLS Connection (rejectUnauthorized: true)');
console.log('-'.repeat(80));

const options = {
  host: TELEBIRR_HOST,
  port: TELEBIRR_PORT,
  servername: TELEBIRR_HOST,
  rejectUnauthorized: true, // ✅ Never bypass this
  timeout: 10000,
};

const socket = tls.connect(options, () => {
  const cert = socket.getPeerCertificate();
  
  console.log('✅ TLS connection successful!');
  console.log('\nCertificate Details:');
  console.log(`  Subject: ${cert.subject?.CN || 'N/A'}`);
  console.log(`  Issuer: ${cert.issuer?.CN || 'N/A'}`);
  console.log(`  Valid From: ${cert.valid_from}`);
  console.log(`  Valid To: ${cert.valid_to}`);
  console.log(`  Authorized: ${socket.authorized}`);
  
  if (!socket.authorized) {
    console.log(`  ⚠️  Authorization Error: ${socket.authorizationError}`);
  }
  
  socket.end();
  
  console.log('\n' + '='.repeat(80));
  console.log('RECOMMENDATION:');
  console.log('='.repeat(80));
  
  if (socket.authorized) {
    console.log('✅ Certificate is valid and trusted!');
    console.log('✅ Standard fetch() will work - no special configuration needed.');
    console.log('✅ Action: Set TELEBIRR_AUTO_LOOKUP_ENABLED=true in production');
  } else {
    const error = socket.authorizationError;
    
    if (error.includes('unable to verify') || error.includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE')) {
      console.log('⚠️  Certificate verification failed (likely missing intermediate CA)');
      console.log('⚠️  Action: Obtain intermediate certificate and use fetchReceiptWithIntermediate()');
      console.log('   OR keep TELEBIRR_AUTO_LOOKUP_ENABLED=false (manual verification only)');
    } else if (error.includes('self signed')) {
      console.log('❌ Self-signed certificate detected');
      console.log('❌ Action: Keep TELEBIRR_AUTO_LOOKUP_ENABLED=false permanently');
      console.log('   Telebirr must use manual verification only');
    } else {
      console.log(`❌ Certificate error: ${error}`);
      console.log('❌ Action: Keep TELEBIRR_AUTO_LOOKUP_ENABLED=false');
    }
  }
  
  console.log('\n' + '='.repeat(80));
  process.exit(0);
});

socket.on('error', (error) => {
  console.log(`\n❌ Connection failed: ${error.message}`);
  console.log(`   Error code: ${error.code || 'N/A'}`);
  
  console.log('\n' + '='.repeat(80));
  console.log('RECOMMENDATION:');
  console.log('='.repeat(80));
  
  if (error.code === 'ENOTFOUND') {
    console.log('❌ DNS resolution failed - host not reachable');
    console.log('   This may be due to:');
    console.log('   - Network restrictions (VPN/firewall)');
    console.log('   - Host only accessible from Ethiopian networks');
    console.log('❌ Action: Keep TELEBIRR_AUTO_LOOKUP_ENABLED=false until network access confirmed');
  } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
    console.log('❌ Connection timeout or refused');
    console.log('   Host may require Ethiopian network access');
    console.log('❌ Action: Keep TELEBIRR_AUTO_LOOKUP_ENABLED=false');
  } else if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || 
             error.code === 'CERT_HAS_EXPIRED' ||
             error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
    console.log('❌ Certificate validation error');
    console.log('   Certificate issue prevents secure automated lookup');
    console.log('❌ Action: Keep TELEBIRR_AUTO_LOOKUP_ENABLED=false');
  } else {
    console.log(`❌ Unexpected error: ${error.message}`);
    console.log('❌ Action: Keep TELEBIRR_AUTO_LOOKUP_ENABLED=false');
  }
  
  console.log('\n' + '='.repeat(80));
  process.exit(1);
});

socket.on('timeout', () => {
  console.log('\n❌ Connection timeout after 10 seconds');
  console.log('❌ Action: Keep TELEBIRR_AUTO_LOOKUP_ENABLED=false');
  socket.destroy();
  process.exit(1);
});

// Also test with HTTPS request
console.log('\nTest 2: HTTPS GET Request');
console.log('-'.repeat(80));

setTimeout(() => {
  const testUrl = `https://${TELEBIRR_HOST}/`;
  
  https.get(testUrl, (res) => {
    console.log(`✅ HTTP Status: ${res.statusCode}`);
    console.log(`   Headers received: ${Object.keys(res.headers).length}`);
    res.on('data', () => {}); // Consume data
    res.on('end', () => {
      console.log('✅ Request completed successfully');
    });
  }).on('error', (error) => {
    console.log(`⚠️  HTTPS request error: ${error.message}`);
    if (error.code) {
      console.log(`   Error code: ${error.code}`);
    }
  });
}, 1000);
