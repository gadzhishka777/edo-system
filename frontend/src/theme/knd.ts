/**
 * Визуальный код модуля «ТОР Контроль».
 *
 * Модуль намеренно отличается от светлого ТОР ЭДО: тёмно-синий фон и один
 * акцент — кнопка действия. Константы держим в одном месте, чтобы страница
 * входа и интерфейс модуля не разъезжались.
 */
export const KND_BG = '#0a1a33';
export const KND_SURFACE = '#10233f';
export const KND_ACCENT = '#0b63f6';
export const KND_ACCENT_HOVER = '#0a58dd';
export const KND_TEXT = '#ffffff';
export const KND_TEXT_MUTED = 'rgba(255, 255, 255, 0.72)';
export const KND_BORDER = 'rgba(255, 255, 255, 0.12)';

/** Маршруты модуля: используются и в роутинге, и как точка возврата после ЕИС. */
export const KND_LOGIN_PATH = '/knd/login';
export const KND_HOME_PATH = '/knd';

/** Разделы модуля. Реестры учёта живут под /knd/account. */
export const KND_ACCOUNT_PATH = '/knd/account';
export const KND_OBJECT_NEW_PATH = '/knd/account/objects/new';
/** Единый реестр контрольных (надзорных) мероприятий. */
export const KND_KNM_PATH = '/knd/knm';
/** Подсистема досудебного обжалования. */
export const KND_APPEALS_PATH = '/knd/appeals';

// ===== Рабочий интерфейс модуля =====
//
// Экран входа тёмный, а сам интерфейс — светлый: так устроен референс ГИС ТОР КНД
// (белые панели, синие плитки-разделы, тёмный рельс с иконками слева).
// Тёмные константы выше остаются только для страницы входа.

/** Фон рабочей области. */
export const KND_APP_BG = '#eef1f5';
/** Белые панели: шапка, панель фильтров, карточки, поля формы. */
export const KND_APP_SURFACE = '#ffffff';
/** Основной синий: плитки на главном экране, активные элементы. */
export const KND_APP_BLUE = '#0b5cd5';
export const KND_APP_BLUE_HOVER = '#0a4fb8';
/** Светло-синяя подложка чипов и баннеров. */
export const KND_APP_BLUE_SOFT = '#e4edfb';
/** Тёмный рельс с иконками разделов. */
export const KND_RAIL_BG = '#152743';
export const KND_APP_TEXT = '#1c2b3a';
export const KND_APP_TEXT_MUTED = '#7b8794';
export const KND_APP_BORDER = '#dfe3e8';
export const KND_APP_HOVER = '#f5f7fa';
/** Зелёный: кнопки сохранения и статус «Действующая». */
export const KND_GREEN = '#2f9e44';
export const KND_GREEN_HOVER = '#28873a';
export const KND_GREEN_SOFT = '#e3f4e8';
export const KND_GREEN_TEXT = '#2b7a3d';
/** Бирюзовый чип «СМАРТ» — маркер признака в реестрах КНД. */
export const KND_TEAL = '#1fb6a6';
/** Жёлтый баннер-подсказка. */
export const KND_WARN_BG = '#fdf0d5';
export const KND_WARN_BORDER = '#f0b429';
export const KND_WARN_TEXT = '#8a6100';
/** Красный: обязательные поля и ошибки. */
export const KND_DANGER = '#d64545';
