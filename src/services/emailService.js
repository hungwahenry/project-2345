// src/services/emailService.js
const mailjet = require('node-mailjet').apiConnect(
    process.env.MAILJET_API_KEY,
    process.env.MAILJET_SECRET_KEY
);
const config = require('../config/config');

/**
 * Send an email using Mailjet
 * @param {Object} options - Email options
 * @returns {Promise} Mailjet response
 */
exports.sendEmail = async (options) => {
    try {
        const { to, subject, text, html, templateId, variables } = options;
        
        // Prepare request
        const request = mailjet.post('send', { version: 'v3.1' }).request({
            Messages: [
                {
                    From: {
                        Email: config.email.fromEmail,
                        Name: config.email.fromName
                    },
                    To: [
                        {
                            Email: to
                        }
                    ],
                    Subject: subject,
                    TextPart: text,
                    HTMLPart: html || undefined,
                    TemplateID: templateId || undefined,
                    Variables: variables || undefined
                }
            ]
        });
        
        // Send email
        const response = await request;
        return response.body;
    } catch (error) {
        console.error('Email service error:', error);
        throw error;
    }
};

/**
 * Send verification email
 * @param {Object} user - User document
 * @param {String} verificationToken - Verification token
 * @returns {Promise} Email send result
 */
exports.sendVerificationEmail = async (user, verificationToken) => {
    const verificationUrl = `${config.clientUrl}/verify-email?token=${verificationToken}`;
    
    return this.sendEmail({
        to: user.email,
        subject: 'Verify Your Email Address',
        text: `Welcome to lowercase! Please verify your email address by clicking on the following link: ${verificationUrl}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #333;">Welcome to lowercase!</h1>
                <p>Please verify your email address by clicking on the link below:</p>
                <p>
                    <a href="${verificationUrl}" 
                       style="background-color: #4CAF50; 
                              color: white; 
                              padding: 12px 24px; 
                              text-decoration: none; 
                              border-radius: 4px; 
                              display: inline-block;">
                        Verify Email Address
                    </a>
                </p>
                <p style="color: #666;">This link will expire in 24 hours.</p>
                <hr style="border: 1px solid #eee; margin: 20px 0;">
                <p style="color: #999; font-size: 12px;">
                    If you did not create an account with us, please ignore this email.
                </p>
            </div>
        `
    });
};

/**
 * Send password recovery email with PIN
 * @param {Object} user - User document
 * @param {String} recoveryPin - Recovery PIN
 * @returns {Promise} Email send result
 */
exports.sendPasswordRecoveryEmail = async (user, recoveryPin) => {
    return this.sendEmail({
        to: user.email,
        subject: 'Password Recovery PIN',
        text: `
Your password recovery PIN is: ${recoveryPin}

This PIN will expire in 24 hours.

If you did not request this password recovery, please ignore this email and ensure your account is secure.

For security reasons:
- Never share this PIN with anyone
- Our staff will never ask for this PIN
- Enter the PIN only on our official website

Best regards,
The lowercase Team
        `,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #333;">Password Recovery PIN</h1>
                <p>Your password recovery PIN is:</p>
                <div style="
                    background: #f5f5f5;
                    padding: 20px;
                    margin: 20px 0;
                    border-radius: 4px;
                    text-align: center;
                ">
                    <h2 style="
                        font-size: 32px;
                        letter-spacing: 5px;
                        margin: 0;
                        color: #333;
                        font-family: monospace;
                    ">${recoveryPin}</h2>
                </div>
                <p>This PIN will expire in 24 hours.</p>
                <div style="
                    background: #fff8e1;
                    padding: 15px;
                    margin: 20px 0;
                    border-left: 4px solid #ffc107;
                    border-radius: 4px;
                ">
                    <h3 style="margin-top: 0; color: #333;">Security Notice</h3>
                    <ul style="color: #666; margin-bottom: 0;">
                        <li>Never share this PIN with anyone</li>
                        <li>Our staff will never ask for this PIN</li>
                        <li>Enter the PIN only on our official website</li>
                    </ul>
                </div>
                <hr style="border: 1px solid #eee; margin: 20px 0;">
                <p style="color: #999; font-size: 12px;">
                    If you did not request this password recovery, please ignore this email and ensure your account is secure.
                </p>
            </div>
        `
    });
};

/**
 * Send notification email
 * @param {Object} user - User document
 * @param {String} subject - Email subject
 * @param {String} message - Notification message
 * @returns {Promise} Email send result
 */
exports.sendNotificationEmail = async (user, subject, message) => {
    return this.sendEmail({
        to: user.email,
        subject: subject,
        text: message,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #333;">${subject}</h1>
                <div style="
                    background: #f5f5f5;
                    padding: 20px;
                    margin: 20px 0;
                    border-radius: 4px;
                ">
                    <p style="margin: 0; color: #333;">${message}</p>
                </div>
                <hr style="border: 1px solid #eee; margin: 20px 0;">
                <p style="color: #999; font-size: 12px;">
                    This is an automated message from lowercase. Please do not reply to this email.
                </p>
            </div>
        `
    });
};