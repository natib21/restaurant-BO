// emails/templates/invitation.js
module.exports = ({ inviteLink, businessName, branchName, roleName, message }) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
  <h2 style="color: #1A1A2E;">You've been invited!</h2>
  <p><strong>${businessName}</strong> has invited you to join as <strong>${roleName}</strong> at <strong>${branchName}</strong>.</p>
  
  ${message ? `<p><em>"${message}"</em></p>` : ''}

  <div style="text-align: center; margin: 30px 0;">
    <a href="${inviteLink}" style="background: #1A1A2E; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 18px;">
      Accept Invitation
    </a>
  </div>

  <p>Or copy this link:<br><small>${inviteLink}</small></p>
  <p>This invitation expires in 7 days.</p>

  <hr>
  <p style="color: #666; font-size: 12px;">
    ጥሪ ተቀብለሃል! ${businessName} በ${branchName} እንደ ${roleName} እንድትቀላቀል ጋብዞሃል።
  </p>
</div>
`;
