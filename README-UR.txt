SecureChat RSA — شروع کرنے کا طریقہ

ضروری چیزیں:
- Node.js (صرف مقامی development server چلانے کے لیے)
- Firebase account
- جدید browser (Web Crypto API کے لیے HTTPS یا localhost ضروری ہے)

1) Firebase project بنائیں:
   https://console.firebase.google.com/
   - Add project کریں۔
   - Project settings > Your apps > Web app رجسٹر کریں۔
   - دی گئی Firebase config کو firebase-config.js میں درج کریں۔
   - Authentication > Sign-in method میں Email/Password فعال کریں۔
   - Firestore Database بنائیں۔
   - Firestore Rules میں firestore.rules کا مواد paste اور Publish کریں۔

2) فائلیں ایک فولڈر میں رکھیں:
   index.html, style.css, app.js, firebase-config.js

3) localhost server چلائیں:
   اس فولڈر میں terminal کھولیں اور چلائیں:
   npx serve .
   پھر دکھایا گیا localhost URL browser میں کھولیں۔
   file:// سے index.html براہ راست نہ کھولیں۔

4) دو الگ devices پر:
   - ویب سائٹ کو HTTPS پر deploy کریں (Firebase Hosting مناسب ہے)۔
   - Device A پر account بنائیں اور اس کا Chat ID کاپی کریں۔
   - Device B پر account بنائیں۔
   - Device A کا ID، Device B میں Start a chat کے ذریعے درج کریں۔
   - دونوں طرف پیغامات بھیج کر ٹیسٹ کریں۔

اہم سیکیورٹی حدود:
- یہ تعلیمی MVP ہے، audited یا production-ready messenger نہیں۔
- اس ورژن میں Private Key اسی browser کے localStorage میں JWK کی صورت محفوظ ہے۔ shared/public device پر اسے استعمال نہ کریں۔
- اسی اکاؤنٹ کو دوسرے browser/device پر استعمال کرنے کے لیے key backup/restore فیچر درکار ہوگا۔ نیا browser نیا key pair بنا سکتا ہے، جس سے پرانے پیغامات decrypt نہیں ہوں گے۔
- Public-key fingerprint verification، rate limiting، abuse protection، account recovery اور encrypted private-key backup کو production سے پہلے شامل کریں۔
- Firebase config browser میں نظر آتی ہے؛ اسے secret نہ سمجھیں۔ اصل حفاظت Firestore Security Rules اور Authentication سے آتی ہے۔
- صرف HTTPS پر deploy کریں۔
