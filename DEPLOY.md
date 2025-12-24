# StreamFreely Firebase Deployment Guide

## Prerequisites
- Firebase CLI installed (already done)
- Firebase project created (streamfreely-b119f)

## Step 1: Login to Firebase
Run this command and follow the browser authentication:
```powershell
firebase login
```

## Step 2: Set Firebase Config (API Keys)
Set your Google API key and stream secret in Firebase config:
```powershell
firebase functions:config:set google.api_key="AIzaSyBANZ_09nGMuPapGlwWW8yF4bXB4WyFaYM" stream.secret="436b0a78c66e68108e57515c7d7445420c67c684a1ed153886334cb68bec6940"
```

## Step 3: Deploy Everything
Deploy both hosting and functions:
```powershell
firebase deploy
```

Or deploy separately:
```powershell
# Deploy only hosting (frontend)
firebase deploy --only hosting

# Deploy only functions (backend API)
firebase deploy --only functions
```

## Step 4: Access Your App
After deployment, your app will be available at:
- **Website**: https://streamfreely-b119f.web.app
- **API**: https://us-central1-streamfreely-b119f.cloudfunctions.net/api

## Troubleshooting

### If functions fail to deploy:
1. Make sure you're on the Blaze (pay-as-you-go) plan - required for Cloud Functions
2. Run `firebase functions:log` to see error logs

### To test locally before deploying:
```powershell
firebase emulators:start
```

## Project Structure
```
streamfreely/
├── public/           # Frontend (deployed to Firebase Hosting)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── functions/        # Backend (deployed to Cloud Functions)
│   ├── index.js      # Express API + streaming
│   └── package.json
├── firebase.json     # Firebase configuration
└── .firebaserc       # Project settings
```
