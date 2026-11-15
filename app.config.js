// Adds google-services.json automatically when the file is in the project.
// (Needed for phone notifications. Without the file the app still builds.)
const fs = require('fs');

module.exports = ({ config }) => {
  const hasGoogleServices = fs.existsSync('./google-services.json');

  return {
    ...config,
    android: {
      ...config.android,
      ...(hasGoogleServices ? { googleServicesFile: './google-services.json' } : {}),
    },
  };
};
