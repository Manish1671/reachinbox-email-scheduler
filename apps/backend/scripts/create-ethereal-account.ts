import nodemailer from 'nodemailer';

async function main(): Promise<void> {
  const account = await nodemailer.createTestAccount();

  console.log('Created an Ethereal test account. Add these values to the repo-root .env file:\n');
  console.log(`ETHEREAL_HOST=${account.smtp.host}`);
  console.log(`ETHEREAL_PORT=${account.smtp.port}`);
  console.log(`ETHEREAL_SECURE=${account.smtp.secure}`);
  console.log(`ETHEREAL_USER=${account.user}`);
  console.log(`ETHEREAL_PASS=${account.pass}`);
  console.log('\nWeb inbox:');
  console.log(account.web);
  console.log('\nDo not commit these credentials. Restart the worker after updating .env.');
}

main().catch((error: unknown) => {
  console.error('Failed to create an Ethereal account', error);
  process.exit(1);
});
