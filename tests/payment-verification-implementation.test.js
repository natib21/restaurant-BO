const mongoose = require('mongoose');
const PaymentVerification = require('../models/PaymentVerification');
const { parseTelebirrHTML } = require('../src/modules/payment-verification/service/providers/parsers/telebirr-parser');

describe('Payment verification evidence enhancement', () => {
  it('stores richer evidence metadata and maintains attempt history model', () => {
    const PaymentAttempt = require('../models/PaymentAttempt');

    const verification = new PaymentVerification({
      merchant: new mongoose.Types.ObjectId(),
      order: new mongoose.Types.ObjectId(),
      provider: 'telebirr',
      providerReference: 'ABC123XYZ',
      originalReference: 'ABC-123-XYZ',
      normalizedReference: 'ABC123XYZ',
      submissionMethod: 'manual_reference',
      rawQrPayload: 'telebirr://receipt/ABC-123-XYZ',
      sourceUrl: 'https://transactioninfo.ethiotelecom.et/receipt/ABC123XYZ',
      extractedRawText: 'amount=250 ETB',
      extractionMethod: 'manual_reference',
      normalizedTransaction: {
        amount: 250,
        currency: 'ETB',
        reference: 'ABC123XYZ',
      },
      matchResult: {
        amountMatch: true,
        currencyMatch: true,
        referenceValid: true,
        referenceUnique: true,
        warnings: [],
      },
      reviewStatus: 'pending_review',
      reviewedBy: new mongoose.Types.ObjectId(),
      reviewedAt: new Date(),
    });

    const attempt = new PaymentAttempt({
      merchant: verification.merchant,
      order: verification.order,
      paymentVerification: verification._id,
      provider: 'telebirr',
      originalReference: 'ABC-123-XYZ',
      normalizedReference: 'ABC123XYZ',
      submissionMethod: 'manual_reference',
      status: 'pending_review',
    });

    expect(verification.toObject()).toHaveProperty('normalizedReference', 'ABC123XYZ');
    expect(verification.toObject()).toHaveProperty('submissionMethod', 'manual_reference');
    expect(verification.toObject()).toHaveProperty('matchResult');
    expect(verification.toObject().matchResult.amountMatch).toBe(true);
    expect(attempt.toObject()).toHaveProperty('normalizedReference', 'ABC123XYZ');
    expect(PaymentAttempt.schema.obj).toHaveProperty('merchant');
  });

  it('extracts real Telebirr receipt fields from the official HTML receipt structure', () => {
    const html = `<!DOCTYPE html><html lang="en"><head><title>telebirr receipt </title></head><body>
      <table>
        <tr><td>የከፋይ ስም/Payer Name</td><td>Nathnael Zelalem Teshome</td></tr>
        <tr><td>የከፋይ ቴሌብር ቁ./Payer telebirr no.</td><td>2519****9921</td></tr>
        <tr><td>የገንዘብ ተቀባይ ስም/Credited Party name</td><td>Getasew Birehan Yigezaw</td></tr>
        <tr><td>የገንዘብ ተቀባይ ቴሌብር ቁ./Credited party account no</td><td>2519****3838</td></tr>
        <tr><td>የክፍያው ሁኔታ/transaction status</td><td>Completed</td></tr>
      </table>
      <table>
        <tr><td>የክፍያ ቁጥር/Invoice No.</td><td>የክፍያ ቀን/Payment date</td><td>የተከፈለው መጠን/Settled Amount</td></tr>
        <tr><td>DHS88YT8T0</td><td>28-08-2026 20:15:59</td><td>20 Birr</td></tr>
      </table>
      <table>
        <tr><td colspan="2">የአገልግሎት ክፍያ/Service fee</td><td>0.87 Birr</td></tr>
        <tr><td colspan="2">ጠቅላላ የተከፈለ/Total Paid Amount</td><td>21 Birr</td></tr>
      </table>
      <div>የክፍያ ምክንያት/Payment Reason</div>
      <div>Send Money to Registered Customer</div>
      <div>የክፍያ ዘዴ/Payment Mode</div>
      <div>telebirr</div>
    </body></html>`;

    const parsed = parseTelebirrHTML(html);

    expect(parsed.amount).toBe(20);
    expect(parsed.status).toBe('SUCCESS');
    expect(parsed.payerName).toBe('Nathnael Zelalem Teshome');
    expect(parsed.receiverName).toBe('Getasew Birehan Yigezaw');
    expect(parsed.reference).toBe('DHS88YT8T0');
    expect(parsed.paymentReason).toBe('Send Money to Registered Customer');
    expect(parsed.paymentMode).toBe('telebirr');
    expect(parsed.transactionDate).toBeTruthy();
  });
});
