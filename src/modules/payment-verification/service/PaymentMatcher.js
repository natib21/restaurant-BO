class PaymentMatcher {
  static buildMatchResult({ expectedAmount, actualAmount, expectedCurrency, actualCurrency, provider, actualProvider, reference, receiverName, merchantReceiverName, transactionDate, expectedTransactionDate, warnings = [] }) {
    const amountMatch = typeof expectedAmount === 'number' && typeof actualAmount === 'number'
      ? Math.abs(actualAmount - expectedAmount) < 0.01
      : false;

    const currencyMatch = expectedCurrency && actualCurrency
      ? String(expectedCurrency).toUpperCase() === String(actualCurrency).toUpperCase()
      : false;

    const providerMatch = provider && actualProvider
      ? String(provider).toLowerCase() === String(actualProvider).toLowerCase()
      : true;

    const referenceValid = Boolean(reference && String(reference).trim().length > 0);

    const receiverMatch = receiverName && merchantReceiverName
      ? String(receiverName).trim().toLowerCase() === String(merchantReceiverName).trim().toLowerCase()
      : true;

    const transactionTimeValid = expectedTransactionDate && transactionDate
      ? true
      : true;

    return {
      amountMatch,
      currencyMatch,
      providerMatch,
      referenceValid,
      referenceUnique: true,
      receiverMatch,
      transactionTimeValid,
      warnings,
    };
  }
}

module.exports = PaymentMatcher;
