# OpenPlan3D — Firebase login va bulutli saqlash

Bu fork GitHub Pages’da ishlaydi. Login va loyiha ma’lumotlari Firebase Authentication + Cloud Firestore orqali boshqariladi.

## 1. Firebase loyihasi yarating

1. https://console.firebase.google.com/ sahifasini oching.
2. **Create a project** ni bosing.
3. Masalan, loyiha nomi: `openplan3d-uz`.
4. Google Analytics majburiy emas.

## 2. Web App qo‘shing

Project Overview → Web (`</>`) → ilova nomi `OpenPlan3D UZ` → **Register app**.

Firebase sizga quyidagi qiymatlarni beradi:

- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`

## 3. GitHub Actions Variables kiriting

GitHub repository → **Settings → Secrets and variables → Actions → Variables → New repository variable**.

Quyidagi 6 ta variable yarating:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Har biriga Firebase Web App konfiguratsiyasidagi mos qiymatni kiriting.

> Bu Firebase Web App konfiguratsiyasi public client configuration hisoblanadi. Xavfsizlik Firestore Security Rules va Firebase Authentication orqali ta’minlanadi.

## 4. Email/Password login yoqing

Firebase Console → **Authentication → Get started → Sign-in method → Email/Password → Enable**.

Saytda ro‘yxatdan o‘tish yo‘q. Foydalanuvchilarni faqat administrator yaratadi.

### Login yaratish

Authentication → Users → **Add user**.

Agar saytda login `admin` bo‘lishini istasangiz, Firebase’da email sifatida:

`admin@openplan3d.local`

kiriting va o‘zingiz tanlagan parolni belgilang.

Saytda foydalanuvchi faqat `admin` deb yozadi; dastur uni ichkarida `admin@openplan3d.local` ga aylantiradi.

## 5. Firestore yarating

Firebase Console → **Firestore Database → Create database**.

Database yaratgandan keyin **Rules** bo‘limiga repositorydagi `firestore.rules` fayli matnini joylashtiring va **Publish** bosing.

Qoidalar har bir foydalanuvchiga faqat o‘z loyihalarini ko‘rish va tahrirlashga ruxsat beradi:

`users/{uid}/projects/{projectId}`

## 6. GitHub Pages domenini Auth uchun ruxsat qiling

Firebase Console → Authentication → Settings → **Authorized domains**.

Quyidagini qo‘shing:

`jahongir5858.github.io`

## 7. Saytni qayta deploy qiling

GitHub’da `main` branch’ga ushbu o‘zgarishlar merge qilingach Pages workflow avtomatik ishga tushadi.

Sayt manzili:

`https://jahongir5858.github.io/openPlan3D/`

## Saqlash qanday ishlaydi

- Har bir o‘zgarish avval brauzerda lokal zaxira qilinadi.
- Auto-save 5 soniyadan keyin Firestore’ga ham yuboradi.
- Boshqa kompyuterdan ayni login bilan kirsangiz, Firestore’dagi loyihalar ko‘rinadi.
- Har bir akkauntning lokal backup kaliti ham alohida.
- Original OpenPlan3D’dagi eski lokal loyihalar faqat birinchi kirgan akkauntga bir marta ko‘chiriladi.

## Muhim

GitHub Pages statik hosting bo‘lgani uchun HTML/JS fayllari public. Login oynasi dasturni ishlatishni cheklaydi; haqiqiy loyiha ma’lumotlari xavfsizligi esa Firebase Authentication va `firestore.rules` bilan ta’minlanadi.
