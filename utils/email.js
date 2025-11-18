const nodeMailer = require('nodemailer');

const sendEmail = async options => {
  const transport = nodeMailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const mailOption = {
    from: 'Mesob foods <hello@mesob.io>',
    to: options.email,
    subject: options.subject,
    text: options.message,
    // html:
  };

  await transport.sendMail(mailOption);
};

module.exports = sendEmail;
