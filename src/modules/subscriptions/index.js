/**
 * Subscriptions Module Index
 * 
 * Central export point for the subscriptions module
 */

module.exports = {
  SubscriptionService: require('./services/subscription.service').SubscriptionService,
  SubscriptionRepository: require('./repositories/subscription.repository').SubscriptionRepository,
  SubscriptionController: require('./controllers/subscription.controller'),
  subscriptionRoutes: require('./subscriptions.routes'),
  requireFeature: require('./middleware/feature-access.middleware').requireFeature,
};
