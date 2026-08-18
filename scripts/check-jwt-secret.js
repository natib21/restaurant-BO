require('dotenv').config({path:'config.env'});
const jwtKeys = Object.keys(process.env).filter(k => k.includes('JWT'));
console.log('JWT-related keys:', jwtKeys.map(k => `"${k}"`));
jwtKeys.forEach(k => {
  console.log(`  ${k}: "${process.env[k]}" (length: ${process.env[k]?.length || 0})`);
});
