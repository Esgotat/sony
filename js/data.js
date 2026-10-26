/* ============================================================
СТАТИКА: текущий пользователь, словари, права. Без загрузок.
============================================================ */
let USER = {
  guest: true, id: -1,
  name: "Гость", short: "Гость",
  dept: null, deg: null,
  roles: [], interests: [], experience: "",
  note: ""
};
const ROLES = {
  res: { label: "Исследователь", letter: "И", color: "#7D8F4C" },
  rev: { label: "Рецензент", letter: "Р", color: "#C05A2E" },
  sup: { label: "Научный руководитель", letter: "Н", color: "#7A9480" },
  trn: { label: "Переводчик", letter: "П", color: "#3E6C8E" },
  adm: { label: "Администратор", letter: "А", color: "#6B2D5C" }
};
const STATUS = {
  wait: { label: "Не проверенные", short: "На проверке", cls: "st-wait" },
  ok: { label: "Проверенные", short: "Проверено", cls: "st-ok" },
  fix: { label: "На доработке", short: "Доработка", cls: "st-fix" },
  no: { label: "Отказ", short: "Отказ", cls: "st-no" }
};
const VERDICT = {
  ok: { label: "Принята", cls: "st-ok" },
  fix: { label: "На доработке", cls: "st-fix" },
  no: { label: "Отклонена", cls: "st-no" }
};
const REQ_TYPES = {
  sup: { label: "Руководство" },
  res: { label: "Исследование" },
  check: { label: "Проверка" },
  trn: { label: "Перевод" }
};
const FAC = ["Математика", "Информатика", "Физика", "Химия", "Гуманитарные науки", "Экономика", "Психология", "Языки"];
const COMPLAINT_TYPES = {
  tech:   { label: "Техническая проблема" },
  content:{ label: "Жалоба на контент" },
  person: { label: "Поведение пользователя" },
  idea:   { label: "Предложение" },
  other:  { label: "Другое" }
};
const COMPLAINT_STATUS = {
  new:    { label: "Новая", cls: "st-wait" },
  doing:  { label: "В работе", cls: "st-fix" },
  closed: { label: "Закрыта", cls: "st-ok" }
};
const LANGS = ["English", "Deutsch", "Français", "Español", "Italiano", "Português", "Polski", "Čeština", "Nederlands", "Türkçe", "Українська", "Беларуская", "Қазақша", "O‘zbekcha", "Тоҷикӣ", "Հայերեն", "ქართული", "Română", "Ελληνικά", "Latviešu", "Lietuvių", "Eesti", "Suomi", "Svenska", "Norsk", "Dansk", "Íslenska", "Gaeilge", "Cymraeg", "Brezhoneg", "Magyar", "Slovenčina", "Slovenščina", "Hrvatski", "Srpski", "Български", "Македонски", "Shqip", "Bosanski", "Crnogorski", "Русский", "Azerbaycan", "Türkmen", "Kyrgyz", "العربية", "עברית", "فارسی", "اردو", "हिन्दी", "বাংলা", "ਪੰਜਾਬੀ", "ગુજરાતી", "मराठी", "தமிழ்", "తెలుగు", "ಕನ್ನಡ", "മലയാളം", "සිංහල", "ไทย", "ລາວ", "ខ្មែរ", "မြန်မာ", "Việt", "Indonesian", "Malay", "Filipino", "Hawaiian", "Māori", "Samoan", "Tongan", "Fijian", "中文", "日本語", "한국어", "Монгол"];
const can = (person, act) => {
  const r = person.roles || [];
  if (r.includes("adm")) return true;
  switch (act) {
    case "review": return r.includes("rev");
    case "supervise": return r.includes("sup");
    case "translate": return r.includes("trn");
    case "coauthor": return r.includes("res");
    case "publish": return r.includes("res") || r.includes("sup");
  }
  return false;
};
const isAdmin = (person) => !!person && (person.roles || []).includes("adm");