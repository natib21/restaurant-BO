const axios = require('axios');
const AppError = require('../../../../utils/appError');
const customerRepository = require('../repositories/customer.repository');

class CustomerAuthService {
  async loginOrCreate(merchantId, branchId, tableId, sessionToken, payload) {
    const { fullName, phone, source = 'guest', telegramUser, facebookToken, tiktokToken } = payload;

    if (!merchantId) throw new AppError('Merchant not identified', 400);

    const baseData = {
      merchant: merchantId,
      fullName: (fullName || 'Guest').trim(),
      currentBranch: branchId || null,
      currentTable: tableId ? String(tableId) : null,
      lastSeen: new Date(),
      lastSeenBranch: branchId || null,
    };

    let filter = { merchant: merchantId };
    let customerData = { ...baseData };

    // Social Data Fetching & Normalization
    if (source === 'telegram' && telegramUser) {
      const { id, username, first_name, last_name, photo_url } = telegramUser;
      filter['telegram.id'] = String(id);
      customerData.source = 'telegram';
      customerData.fullName = `${first_name || ''} ${last_name || ''}`.trim() || 'Telegram User';
      customerData.telegram = {
        id: String(id),
        username: username || null,
        firstName: first_name || null,
        lastName: last_name || null,
        profilePic: photo_url || null,
      };
    } else if (source === 'facebook' && facebookToken) {
      try {
        const { data } = await axios.get('https://graph.facebook.com/v20.0/me', {
          params: { fields: 'id,name,email,picture.type(large)', access_token: facebookToken },
          timeout: 8000,
        });

        filter['facebook.id'] = data.id;
        customerData.source = 'facebook';
        customerData.fullName = data.name || 'Facebook User';
        customerData.facebook = {
          id: data.id,
          email: data.email || null,
          profilePic: data.picture?.data?.url || null,
        };
      } catch (err) {
        throw new AppError('Invalid or expired Facebook token', 401);
      }
    } else if (source === 'tiktok' && tiktokToken) {
      try {
        const { data } = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
          headers: { Authorization: `Bearer ${tiktokToken}` },
          params: { fields: 'open_id,username,avatar_url,display_name' },
          timeout: 8000,
        });

        const user = data.data.user;
        filter['tiktok.id'] = user.open_id;
        customerData.source = 'tiktok';
        customerData.fullName = user.display_name || user.username || 'TikTok User';
        customerData.tiktok = {
          id: user.open_id,
          username: user.username || null,
          profilePic: user.avatar_url || null,
        };
      } catch (err) {
        throw new AppError('Invalid or expired TikTok token', 401);
      }
    } else if (phone) {
      const cleanPhone = phone.replace(/\s+/g, '');
      const normalized = cleanPhone.startsWith('0') ? '+251' + cleanPhone.slice(1) : cleanPhone;

      if (!/^\+251[79]\d{8}$/.test(normalized)) {
        throw new AppError('Invalid Ethiopian phone number. Use +2519xxxxxxxx or 09xxxxxxxx', 400);
      }

      filter.phone = normalized;
      customerData.phone = normalized;
      customerData.source = 'phone';
    } else {
      customerData.source = 'guest';
    }

    let session = null;
    if (sessionToken && tableId && branchId) {
      session = await customerRepository.findSessionAndRefresh(sessionToken, merchantId, branchId, tableId);
    }

    let customer = await customerRepository.findOne(filter);
    
    const recordHistory = (cust, action, details) => {
      if (!Array.isArray(cust.history)) cust.history = [];
      cust.history.push({
        action,
        source: customerData.source,
        branch: branchId,
        table: tableId,
        details,
        addedAt: new Date(),
      });
    };

    if (customer) {
      Object.assign(customer, customerData);
      customer.lastSeen = new Date();
      customer.lastSeenBranch = branchId || customer.lastSeenBranch;

      ['telegram', 'facebook', 'tiktok'].forEach(platform => {
        if (customerData[platform]) {
          customer[platform] = { ...customer[platform], ...customerData[platform] };
        }
      });

      if (session) {
        session.customer = customer._id;
        await session.save();
      }

      recordHistory(customer, 'login', session ? 'Seated via QR code' : 'Logged in');
      await customer.save();

      return {
        customer,
        isNew: false,
        seated: !!session,
        message: session ? 'Welcome back! You are now seated.' : 'Logged in successfully'
      };
    }

    customer = await customerRepository.create(customerData);

    if (session) {
      session.customer = customer._id;
      await session.save();
    }

    recordHistory(customer, 'signup', session ? 'First time via QR code' : 'New account created');
    await customer.save();

    return {
      customer,
      isNew: true,
      seated: !!session,
      message: session ? 'Welcome! You are now seated.' : 'Account created successfully'
    };
  }
}

module.exports = new CustomerAuthService();
