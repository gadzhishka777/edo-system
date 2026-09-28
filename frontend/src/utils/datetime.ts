// frontend/src/utils/datetime.ts
// Синхронизация времени между сервером (Europe/Moscow) и клиентом.
//
// Проблема «рассинхрона времени»:
//  1) API отдаёт даты в ISO-строках БЕЗ указания часового пояса (naive-MSK,
//     например "2026-08-21T14:03:00"). Конструктор new Date(...) такие строки
//     парсит как ЛОКАЛЬНОЕ время браузера: на машине в UTC+5 все даты
//     «уезжают» на 2 часа вперёд, в UTC — на 3 назад.
//  2) Часы клиента могут отличаться от серверных, а дедлайны (регистрация
//     обращений, ответы на письма) считаются от серверного времени.
//
// Решение:
//  - parseApiDate() дополняет naive-строки смещением +03:00 (MSK) перед
//    парсингом — даты API больше не зависят от локали браузера;
//  - перехватчик edoApi читает заголовок X-Server-Time из каждого ответа
//    и обновляет skew, поэтому serverNow() идёт по серверным часам;
//  - formatApiDateTime()/formatApiDate() форматируют в MSK независимо от
//    локали браузера.

const MSK_SUFFIX = '+03:00';

/** В строке уже есть явная зона: "…Z", "…+03:00", "…-05:00"? */
function hasExplicitZone(s: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
}

/**
 * Разобрать дату-время из API как MSK.
 * Строки без зоны считаются московским временем и дополняются "+03:00".
 */
export function parseApiDate(value: string | number | Date): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const raw = String(value).trim();
  if (!raw) return new Date(NaN);

  // "21.08.2026" / "21.08.2026 14:03" — русский формат из legacy-полей
  const ru = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ru) {
    const [, d, m, y, hh = '00', mm = '00', ss = '00'] = ru;
    return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}${MSK_SUFFIX}`);
  }

  // "2026-08-21 14:03:00" → ISO с "T"
  const normalized = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw;

  // "2026-02-07" — только дата, без времени (именно так API отдаёт expire_date).
  // Смещение можно дописывать только ПОСЛЕ времени: строка "2026-02-07+03:00"
  // невалидна, new Date() вернёт Invalid Date, а в UI появится «Осталось NaN дн.».
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return new Date(`${normalized}T00:00:00${MSK_SUFFIX}`);
  }

  if (!hasExplicitZone(normalized)) {
    return new Date(`${normalized}${MSK_SUFFIX}`);
  }
  return new Date(normalized);
}

// ===== Серверное смещение часов =====

let serverSkewMs = 0;

/** Обновить смещение по заголовку X-Server-Time (ISO, MSK). Вызывается из edoApi. */
export function updateServerTime(headerValue: string | null | undefined): void {
  if (!headerValue) return;
  try {
    const server = new Date(headerValue).getTime();
    if (Number.isFinite(server)) {
      serverSkewMs = server - Date.now();
    }
  } catch {
    // заголовок битый — оставляем прежнее смещение
  }
}

/** Текущее смещение клиента относительно сервера, мс. */
export function getServerSkewMs(): number {
  return serverSkewMs;
}

/** «Серверное сейчас»: часы клиента, скорректированные на серверное смещение. */
export function serverNow(): Date {
  return new Date(Date.now() + serverSkewMs);
}

// ===== Форматирование (всегда Europe/Moscow) =====

const mskTimeZone = 'Europe/Moscow';

/** "21.08.2026, 14:03" */
export function formatApiDateTime(value: string | number | Date): string {
  const d = parseApiDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: mskTimeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** "21.08.2026" */
export function formatApiDate(value: string | number | Date): string {
  const d = parseApiDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: mskTimeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}
