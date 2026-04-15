import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL ?? 'noreply@vehiclefinance.co.za';
const FROM_NAME = process.env.SENDGRID_FROM_NAME ?? 'Vehicle Finance';

export async function sendEmail(to: string, subject: string, htmlBody: string): Promise<void> {
  await sgMail.send({
    to,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject,
    html: htmlBody,
  });
}

export async function sendTemplateEmail(
  to: string,
  templateId: string,
  dynamicData: Record<string, unknown>,
): Promise<void> {
  await sgMail.send({
    to,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    templateId,
    dynamicTemplateData: dynamicData,
  });
}
