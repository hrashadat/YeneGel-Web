(function () {
  const translations = {
    'MÜŞTƏRİ KARTI': ['КАРТА КЛИЕНТА', 'CUSTOMER CARD'],
    'Kassir/Admin girişi': ['Вход кассира/администратора', 'Cashier/Admin login'],
    'Tema seçimi': ['Выбор темы', 'Theme selection'],
    'Dil seçimi': ['Выбор языка', 'Language selection'],
    'Giriş və qeydiyyat': ['Вход и регистрация', 'Sign-in and registration'],
    'Müştəri hesabı': ['Аккаунт клиента', 'Customer account'],
    'Davam etmək üçün giriş edin və ya yeni hesab yaradın.': ['Войдите или создайте аккаунт, чтобы продолжить.', 'Sign in or create an account to continue.'],
    'Restoran linki tələb olunur': ['Требуется ссылка ресторана', 'Restaurant link required'],
    'Səhifəyə daxil olmaq üçün restoranın linkində ?slug=restoran-kodu olmalıdır.': ['Для доступа используйте ссылку ресторана с параметром ?slug=код-ресторана.', 'Use the restaurant link with the ?slug=restaurant-code parameter to access this page.'],
    'Giriş': ['Вход', 'Sign in'],
    'Qeydiyyat': ['Регистрация', 'Register'],
    'Hesab adı': ['Имя аккаунта', 'Account name'],
    'Hesab adınızı daxil edin': ['Введите имя аккаунта', 'Enter your account name'],
    'Kod (4–32 simvol)': ['Код (4–32 символа)', 'Code (4–32 characters)'],
    'Kodunuzu daxil edin': ['Введите код', 'Enter your code'],
    'Kodu göstər': ['Показать код', 'Show code'],
    'Kodu gizlət': ['Скрыть код', 'Hide code'],
    'Giriş et': ['Войти', 'Sign in'],
    'Yeni hesab adı yaradın': ['Создайте имя аккаунта', 'Create an account name'],
    'Öz kodunuz (4–32 simvol)': ['Ваш код (4–32 символа)', 'Your code (4–32 characters)'],
    'Yeni kod yaradın': ['Создайте новый код', 'Create a new code'],
    'Hesab yarat': ['Создать аккаунт', 'Create account'],
    'Çıxış et': ['Выйти', 'Log out'],
    'Yüklənir...': ['Загрузка...', 'Loading...'],
    'Yüklənir': ['Загрузка', 'Loading'],
    '0 / 5 möhür': ['0 / 5 печатей', '0 / 5 stamps'],
    'Toplam hesab': ['Общая сумма покупок', 'Total spent'],
    'Cari bonus': ['Текущий бонус', 'Current bonus'],
    'Supabase-də apply_customer_stamp_transaction funksiyası və ya parametr imzası tapılmadı. SQL migration-ları yoxlayın.': [
      'В Supabase не найдена функция apply_customer_stamp_transaction или её сигнатура параметров не совпадает. Проверьте SQL-миграции.',
      'The Supabase apply_customer_stamp_transaction function or its parameter signature was not found. Check the SQL migrations.'
    ],
    'Şəxsi QR kodunuz': ['Ваш личный QR-код', 'Your personal QR code'],
    'Məkan haqqında': ['О заведении', 'About the restaurant'],
    'Light': ['Светлая', 'Light'],
    'Dark': ['Тёмная', 'Dark'],
    'Kassir/Admin girişi': ['Вход кассира/администратора', 'Cashier/Admin login'],
    'KASSİR VƏ ADMIN': ['КАССИР И АДМИНИСТРАТОР', 'CASHIER AND ADMIN'],
    'Dark mode': ['Тёмная тема', 'Dark mode'],
    'Light mode': ['Светлая тема', 'Light mode'],
    'Müştəri səhifəsi': ['Страница клиента', 'Customer page'],
    'Kassir panelinə giriş': ['Вход в панель кассира', 'Cashier panel login'],
    'Davam etmək üçün restoranın 4 rəqəmli kassir PİN kodunu daxil edin.': ['Введите 4-значный PIN кассира, чтобы продолжить.', 'Enter the restaurant’s 4-digit cashier PIN to continue.'],
    'Kassir PİN kodu': ['PIN кассира', 'Cashier PIN'],
    'Daxil ol': ['Войти', 'Log in'],
    'Panel bölmələri': ['Разделы панели', 'Panel sections'],
    'Kassir skaneri': ['Сканер кассира', 'Cashier scanner'],
    'Admin paneli': ['Панель администратора', 'Admin panel'],
    'Kassir skaner paneli': ['Панель сканирования кассира', 'Cashier scanning panel'],
    'Müştərinin QR kodunu kameraya göstərin. Kamera icazəsi üçün sayt HTTPS üzərindən açılmalıdır.': ['Покажите QR-код клиента камере. Для доступа к камере сайт должен работать через HTTPS.', 'Show the customer’s QR code to the camera. The site must use HTTPS for camera access.'],
    'Telefon:': ['Телефон:', 'Phone:'],
    'ID:': ['ID:', 'ID:'],
    'Yeməyin məbləği (AZN)': ['Сумма заказа (AZN)', 'Bill amount (AZN)'],
    'məs: 25.00': ['например: 25.00', 'e.g. 25.00'],
    '+ Möhür əlavə et': ['+ Добавить печать', '+ Add stamp'],
    'Başqa müştərini skan et': ['Сканировать другого клиента', 'Scan another customer'],
    'Təhlükəli əməliyyatlar': ['Опасные операции', 'Dangerous actions'],
    '− Möhür sil': ['− Удалить печать', '− Remove stamp'],
    'Admin panelinə giriş': ['Вход в панель администратора', 'Admin panel login'],
    'Restoranın admin kodu ilə menyu, tənzimləmələr və müştəriləri idarə edin.': ['Управляйте меню, настройками и клиентами с помощью кода администратора.', 'Manage the menu, settings, and customers with the admin code.'],
    'Admin giriş kodu': ['Код администратора', 'Admin access code'],
    'Admin panelini aç': ['Открыть панель администратора', 'Open admin panel'],
    'Restoran ayarları': ['Настройки ресторана', 'Restaurant settings'],
    'Admin çıxışı': ['Выход администратора', 'Admin logout'],
    'Möhür sayı (hədəf, 1–20)': ['Количество печатей (цель, 1–20)', 'Stamp goal (1–20)'],
    'Kassir PİN kodu (4 rəqəm)': ['PIN кассира (4 цифры)', 'Cashier PIN (4 digits)'],
    'Bonus rejimi': ['Режим бонуса', 'Bonus mode'],
    'Sabit məbləğ (AZN)': ['Фиксированная сумма (AZN)', 'Fixed amount (AZN)'],
    'Faiz (%)': ['Процент (%)', 'Percent (%)'],
    'Bonus məbləği (AZN)': ['Сумма бонуса (AZN)', 'Bonus amount (AZN)'],
    'Bonus faizi (%)': ['Процент бонуса (%)', 'Bonus percentage (%)'],
    'Mövcud bonus: {{amount}} AZN': ['Доступный бонус: {{amount}} AZN', 'Available bonus: {{amount}} AZN'],
    'Bonus banner mətni': ['Текст баннера бонуса', 'Bonus banner text'],
    'Restoran adı': ['Название ресторана', 'Restaurant name'],
    'Restoran haqqında': ['О ресторане', 'About the restaurant'],
    'Ünvan': ['Адрес', 'Address'],
    'Əlaqə nömrəsi': ['Контактный номер', 'Contact number'],
    'Instagram': ['Instagram', 'Instagram'],
    'Rəqəmsal menyu (JSON)': ['Цифровое меню (JSON)', 'Digital menu (JSON)'],
    'Dəyişiklikləri yadda saxla': ['Сохранить изменения', 'Save changes'],
    'Müştəri siyahısı': ['Список клиентов', 'Customer list'],
    'Son 500 qeydiyyatdan keçmiş müştəri və onların cari kart balansı.': ['Последние 500 зарегистрированных клиентов и баланс их карт.', 'The 500 most recently registered customers and their current card balances.'],
    'Ad soyad': ['Имя и фамилия', 'Name'],
    'Telefon': ['Телефон', 'Phone'],
    'Möhür': ['Печати', 'Stamps'],
    'Bonus': ['Бонус', 'Bonus'],
    'Qeydiyyat': ['Регистрация', 'Registered'],
    'Möhür silmək istədiyinizdən əminsinizmi?': ['Вы уверены, что хотите удалить печать?', 'Are you sure you want to remove a stamp?'],
    'Davam etmək üçün kassir PİN kodunu daxil edin.': ['Введите PIN кассира, чтобы продолжить.', 'Enter the cashier PIN to continue.'],
    'Ləğv et': ['Отмена', 'Cancel'],
    'Davam et': ['Продолжить', 'Continue'],
    'Sorğu tamamlanmadı.': ['Запрос не выполнен.', 'Request did not complete.'],
    'Sorğu uğursuz oldu.': ['Не удалось выполнить запрос.', 'Request failed.'],
    'Serverlə əlaqə alınmadı.': ['Не удалось связаться с сервером.', 'Could not connect to the server.'],
    'Səhifəni birbaşa fayl kimi açmaq olmaz. Netlify Dev ilə serverdən açın.': ['Откройте страницу через Netlify Dev, а не как локальный файл.', 'Open this page through Netlify Dev, not as a local file.'],
    'Təhlükəsizlik xidməti hazır deyil. Supabase mühit dəyişənlərini yoxlayın və tələb olunan SQL migration-ı tətbiq edin.': ['Служба безопасности не готова. Проверьте переменные среды Supabase и примените необходимую SQL-миграцию.', 'The security service is not ready. Check Supabase environment variables and apply the required SQL migration.'],
    'Giriş alınmadı.': ['Не удалось войти.', 'Sign-in failed.'],
    'Qeydiyyat tamamlanmadı.': ['Регистрация не завершена.', 'Registration did not complete.'],
    'Müştəri kartı yüklənmədi.': ['Не удалось загрузить карту клиента.', 'Could not load the customer card.'],
    'Müştəri kartı yenilənmədi.': ['Не удалось обновить карту клиента.', 'Could not refresh the customer card.'],
    'Müştəri kartı yenilənə bilmədi. Yenidən yoxlanılır...': ['Не удалось обновить карту клиента. Повторная попытка...', 'Could not refresh the customer card. Retrying...'],
    'Hesab adında hərf, rəqəm, boşluq, nöqtə, tire və alt xətt istifadə edin.': ['Имя аккаунта может содержать буквы, цифры и символы.', 'Account names can contain letters, numbers, and symbols.'],
    'Kod 4–32 simvoldan ibarət olmalıdır.': ['Код должен содержать 4–32 символа.', 'Code must contain 4–32 characters.'],
    'Bu hesab adı artıq istifadə olunur. Başqa hesab adı seçin.': ['Это имя аккаунта уже занято. Выберите другое.', 'That account name is already in use. Choose another.'],
    'Hesab adı və ya kod yanlışdır.': ['Неверное имя аккаунта или код.', 'Account name or code is incorrect.'],
    'Restoran tapılmadı.': ['Ресторан не найден.', 'Restaurant not found.'],
    'PİN kod yanlışdır.': ['Неверный PIN.', 'Incorrect PIN.'],
    'Kassir PİN kodu yanlışdır.': ['Неверный PIN кассира.', 'Incorrect cashier PIN.'],
    'Admin giriş kodu yanlışdır.': ['Неверный код администратора.', 'Incorrect admin access code.'],
    'Xüsusi giriş kodu yanlışdır.': ['Неверный специальный код доступа.', 'Incorrect admin access code.'],
    'QR kod etibarsızdır.': ['Недействительный QR-код.', 'Invalid QR code.'],
    'Müştəri QR kodu etibarsızdır.': ['Недействительный QR-код клиента.', 'Invalid customer QR code.'],
    'PİN kod 4 rəqəm olmalıdır.': ['PIN должен состоять из 4 цифр.', 'PIN must contain 4 digits.'],
    'PİN kod tam 4 rəqəmdən ibarət olmalıdır.': ['PIN должен состоять ровно из 4 цифр.', 'PIN must contain exactly 4 digits.'],
    'Düzgün hesab məbləği daxil edin.': ['Введите корректную сумму заказа.', 'Enter a valid bill amount.'],
    'Yeməyin məbləğini düzgün daxil edin.': ['Введите корректную сумму заказа.', 'Enter a valid bill amount.'],
    'Müştəri tapılmadı.': ['Клиент не найден.', 'Customer not found.'],
    'Müştəri kartı tapılmadı.': ['Карта клиента не найдена.', 'Customer card not found.'],
    'Möhür silmək üçün kartda möhür yoxdur.': ['На карте нет печатей для удаления.', 'There are no stamps to remove.'],
    'Ləğv ediləcək xal yoxdur.': ['Нет печатей для отмены.', 'There are no stamps to undo.'],
    'Aktiv bonus yoxdur.': ['Нет доступного бонуса.', 'No bonus is available.'],
    'İstifadə ediləcək bonus məbləğini düzgün daxil edin.': ['Введите корректную сумму бонуса для списания.', 'Enter a valid amount of bonus to redeem.'],
    'İstifadə ediləcək bonus məbləği düzgün deyil.': ['Некорректная сумма списания бонуса.', 'Invalid bonus redemption amount.'],
    'İstifadə ediləcək məbləğ bonus balansından çox ola bilməz.': ['Сумма списания не может превышать баланс бонуса.', 'Redemption amount cannot exceed the bonus balance.'],
    'Bonus əməliyyatı tamamlanmadı.': ['Не удалось выполнить операцию с бонусом.', 'Bonus operation could not be completed.'],
    'Möhür əməliyyatını geri almaq mümkün olmadı.': ['Не удалось отменить операцию с печатью.', 'Could not undo the stamp operation.'],
    'Sorğular çox tez-tez göndərilir. Bir az sonra yenidən cəhd edin.': ['Слишком много запросов. Попробуйте позже.', 'Too many requests. Please try again shortly.'],
    'Xidmət müvəqqəti əlçatan deyil.': ['Сервис временно недоступен.', 'Service is temporarily unavailable.'],
    'QR kod kitabxanası yüklənmədi. İnternet bağlantısını yoxlayın.': ['Не удалось загрузить библиотеку QR-кодов. Проверьте подключение к интернету.', 'QR library failed to load. Check your internet connection.'],
    'QR skaner kitabxanası yüklənmədi. İnternet bağlantısını yoxlayın.': ['Не удалось загрузить библиотеку сканера QR-кодов. Проверьте подключение к интернету.', 'QR scanner library failed to load. Check your internet connection.'],
    'Müştəri kartı yoxlanılır...': ['Проверка карты клиента...', 'Checking customer card...'],
    'Bu QR kod Yenə gəl müştəri kartına aid deyil.': ['Этот QR-код не относится к карте Yenə gəl.', 'This QR code is not for a Yenə gəl customer card.'],
    'Müştəri kartı tapılmadı.': ['Карта клиента не найдена.', 'Customer card not found.'],
    'Kameranı başlatmaq mümkün olmadı.': ['Не удалось запустить камеру.', 'Could not start the camera.'],
    'Möhür əlavə edildi': ['Печать добавлена', 'Stamp added'],
    'Möhür silindi': ['Печать удалена', 'Stamp removed'],
    'Admin panelinə giriş alınmadı.': ['Не удалось войти в панель администратора.', 'Could not log in to the admin panel.'],
    'Dəyişikliklər yadda saxlanıldı.': ['Изменения сохранены.', 'Changes saved.'],
    'Dəyişiklikləri yadda saxlamaq alınmadı.': ['Не удалось сохранить изменения.', 'Could not save changes.'],
    'Müştəri siyahısı yüklənir...': ['Загрузка списка клиентов...', 'Loading customer list...'],
    'Hələ müştəri yoxdur.': ['Клиентов пока нет.', 'No customers yet.'],
    'Möhür əlavə edilə bilmədi.': ['Не удалось добавить печать.', 'Could not add stamp.'],
    'Bonus istifadə et': ['Списать бонус', 'Redeem bonus'],
    'Bonus işlətmək üçün möhür hədəfi tamamlanmalıdır.': ['Для списания бонуса необходимо заполнить цель по печатям.', 'Complete the stamp goal before redeeming bonus.'],
    'Nə qədər manat bonus işlətmək istəyirsiniz?': ['Сколько манатов бонуса списать?', 'How much bonus would you like to redeem?'],
    'Möhür sayı': ['Количество печатей', 'Stamp count'],
    'Bonusu uğurla işlətdik.': ['Бонус успешно списан.', 'Bonus redeemed successfully.'],
    'Bonus balansı': ['Баланс бонуса', 'Bonus balance'],
    'möhür': ['печати', 'stamps'],
    'Bizdə bu qədər bonus var': ['Ваш бонусный баланс', 'Your bonus balance'],
    'Cari bonus': ['Текущий бонус', 'Current bonus'],
    '{{amount}} AZN (+ {{carryover}} AZN keçən dəfədən qalan bonus)': [
      '{{amount}} AZN (+ {{carryover}} AZN осталось с прошлого раза)',
      '{{amount}} AZN (+ {{carryover}} AZN carried over from last time)'
    ],
    '{{current}} / {{goal}} möhür': ['{{current}} / {{goal}} печатей', '{{current}} / {{goal}} stamps'],
    'Müştəri ID: {{id}}': ['ID клиента: {{id}}', 'Customer ID: {{id}}'],
    'Telefon: {{phone}}': ['Телефон: {{phone}}', 'Phone: {{phone}}'],
    'ID: {{id}}': ['ID: {{id}}', 'ID: {{id}}'],
    '{{count}} müştəri göstərilir.': ['Показано клиентов: {{count}}.', 'Showing {{count}} customers.'],
    'Əlaqə': ['Контакты', 'Contact'],
    'Origin not allowed': ['Источник запроса не разрешён.', 'Request origin is not allowed.'],
    'Kassir PİN kodu (dəyişmək üçün yeni 4 rəqəm daxil edin)': ['PIN кассира (для изменения введите новый PIN из 4 цифр)', 'Cashier PIN (enter a new 4-digit PIN to change)'],
    'Restoran kodu: {{slug}}': ['Код ресторана: {{slug}}', 'Restaurant code: {{slug}}'],
    'Sorğu məlumatı etibarsızdır.': ['Данные запроса недействительны.', 'Invalid request data.'],
    'Möhür əməliyyatı etibarsızdır.': ['Недействительная операция с печатью.', 'Invalid stamp operation.'],
    'Kassir PİN kodu 4 rəqəm olmalıdır.': ['PIN кассира должен состоять из 4 цифр.', 'Cashier PIN must contain 4 digits.'],
    'Bonus dəyərini düzgün daxil edin.': ['Введите корректное значение бонуса.', 'Enter a valid bonus value.'],
    'Möhür sayı 1-20 arası tam ədəd olmalıdır.': ['Количество печатей должно быть целым числом от 1 до 20.', 'Stamp goal must be a whole number from 1 to 20.'],
    'Bonus rejimi düzgün seçilməyib.': ['Выбран неверный режим бонуса.', 'The selected bonus mode is invalid.'],
    'Menyu JSON formatında obyekt və ya siyahı olmalıdır.': ['Меню должно быть объектом или массивом JSON.', 'Menu must be a JSON object or array.'],
    'Restoran məlumatlarının uzunluğu etibarsızdır.': ['Недопустимая длина данных ресторана.', 'Restaurant field length is invalid.'],
    'Restoran, admin kodu və kassir PİN kodu tələb olunur.': ['Требуются ресторан, код администратора и PIN кассира.', 'Restaurant, admin code, and cashier PIN are required.'],
    'Restoran kodu, admin kodu və kassir PİN kodu tələb olunur.': ['Требуются код ресторана, код администратора и PIN кассира.', 'Restaurant slug, admin code, and cashier PIN are required.'],
    'Slug, admin kodu və cari kassir PİN kodu tələb olunur.': ['Требуются slug, код администратора и текущий PIN кассира.', 'Slug, admin code, and current cashier PIN are required.'],
    'Bonus məbləği çox böyükdür.': ['Сумма бонуса слишком велика.', 'Bonus amount is too large.'],
    'Hesab məbləği çox böyükdür.': ['Сумма заказа слишком велика.', 'Bill amount is too large.'],
    'Müştəri kartı hazırlana bilmədi.': ['Не удалось создать карту клиента.', 'Could not create the customer card.'],
    'Müştəri kartı yenilənmədi.': ['Не удалось обновить карту клиента.', 'Customer card could not be updated.'],
    'Restoran ayarları yenilənmədi.': ['Не удалось обновить настройки ресторана.', 'Restaurant settings could not be updated.'],
    'Çıxış məlumatını bu cihazdan silmək mümkün olmadı.': ['Не удалось удалить данные выхода с этого устройства.', 'Could not clear sign-out data from this device.'],
    'Bu cihazda müştəri məlumatını oxumaq mümkün olmadı.': ['Не удалось прочитать данные клиента на этом устройстве.', 'Could not read customer data on this device.'],
    'Müştəri məlumatı cavabda tapılmadı.': ['В ответе отсутствуют данные клиента.', 'Customer data is missing from the response.'],
    'QR kod kitabxanası yüklənmədi. İnternet bağlantısını yoxlayın.': ['Не удалось загрузить библиотеку QR-кодов. Проверьте подключение к интернету.', 'QR library failed to load. Check your internet connection.']
  };

  const languageNames = ['az', 'ru', 'en'];
  const originalText = new WeakMap();
  const originalAttributes = new WeakMap();
  let language = 'az';

  function getLanguage() {
    return language;
  }

  function translate(value, replacements) {
    const text = String(value == null ? '' : value);
    let output = text;
    if (language !== 'az') {
      const direct = translations[text];
      if (direct) {
        output = direct[language === 'ru' ? 0 : 1];
      } else {
        for (const [source, localized] of Object.entries(translations)) {
          if (localized.includes(text)) {
            output = text;
            break;
          }
          if (text.startsWith(source)) {
            output = localized[language === 'ru' ? 0 : 1] + text.slice(source.length);
            break;
          }
        }
      }
    }
    if (replacements) {
      Object.entries(replacements).forEach(([key, replacement]) => {
        output = output.split(`{{${key}}}`).join(String(replacement));
      });
    }
    return output;
  }

  function applyLanguage(nextLanguage) {
    language = languageNames.includes(nextLanguage) ? nextLanguage : 'az';
    document.documentElement.lang = language;
    const cashierPage = /(?:^|\/)kassir\.html$/i.test(window.location.pathname);
    document.title = cashierPage
      ? ['Yenə gəl — Kassir və Admin', 'Yenə gəl — Кассир и администратор', 'Yenə gəl — Cashier & Admin'][languageNames.indexOf(language)]
      : ['Yenə gəl — Rəqəmsal Sadiqlik Kartı', 'Yenə gəl — Карта лояльности', 'Yenə gəl — Digital Loyalty Card'][languageNames.indexOf(language)];

    const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (textWalker.nextNode()) {
      const node = textWalker.currentNode;
      if (!originalText.has(node)) originalText.set(node, node.nodeValue);
      const source = originalText.get(node);
      const trimmed = source.trim();
      if (!trimmed) continue;
      const translated = translate(trimmed);
      if (translated !== trimmed) {
        const leading = source.match(/^\s*/)[0];
        const trailing = source.match(/\s*$/)[0];
        node.nodeValue = `${leading}${translated}${trailing}`;
      } else {
        node.nodeValue = source;
      }
    }

    document.querySelectorAll('[placeholder], [title], [aria-label]').forEach(element => {
      ['placeholder', 'title', 'aria-label'].forEach(attribute => {
        if (!element.hasAttribute(attribute)) return;
        let originals = originalAttributes.get(element);
        if (!originals) {
          originals = {};
          originalAttributes.set(element, originals);
        }
        if (originals[attribute] === undefined) originals[attribute] = element.getAttribute(attribute);
        element.setAttribute(attribute, translate(originals[attribute]));
      });
    });

    document.querySelectorAll('[data-language]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.language === language));
      button.classList.toggle('active', button.dataset.language === language);
    });
    try {
      localStorage.setItem('yenegel_language', language);
    } catch (error) {
      console.warn('Dil seçimi yadda saxlanmadı:', error);
    }
    window.dispatchEvent(new CustomEvent('yenegel-language-change', { detail: { language } }));
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-language]');
    if (button) applyLanguage(button.dataset.language);
  });

  let storedLanguage = 'az';
  try {
    const stored = localStorage.getItem('yenegel_language');
    if (languageNames.includes(stored)) storedLanguage = stored;
  } catch (error) {
    console.warn('Yadda saxlanmış dil seçimi oxunmadı:', error);
  }
  applyLanguage(storedLanguage);

  window.YeneGelI18n = { getLanguage, t: translate, setLanguage: applyLanguage };
})();
