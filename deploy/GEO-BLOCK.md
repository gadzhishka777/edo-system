# Гео-ограничение: доступ только из РФ, Беларуси и Казахстана

Сервис ТОР ЭДО должен открываться только из России, Беларуси и Казахстана.
Всем остальным отдаётся страница **«Доступ ограничен»**
(`deploy/geoip/geo-blocked.html`) со статусом **403**.

---

## Быстрый старт (копировать целиком)

Порядок важен: **сначала модуль и база, потом конфиг.** Если поставить конфиг
раньше, `nginx -t` упадёт на отсутствующем файле базы, и `reload` не состоится.

Всё сразу делает установщик — он идемпотентный, проверяет предпосылки,
делает бэкапы и **откатывается сам**, если `nginx -t` не прошёл:

```bash
cd /var/www/edo
git pull
sudo bash deploy/geoip/install_geo_block.sh
```

Полезные флаги: `--dry-run` (только показать план), `--http` (поставить
HTTP-вариант конфига), `--no-reload`.

<details>
<summary>То же самое вручную (если хочется по шагам)</summary>

```bash
cd /var/www/edo
git pull

# 0. ПРОВЕРИТЬ, ЧТО /etc/nginx/nginx.conf — ГЛАВНЫЙ конфиг, а не файл сайта
grep -c worker_processes /etc/nginx/nginx.conf     # ожидаем 0

# 1. модуль GeoIP2 для nginx (есть в main-репозитории Ubuntu 22.04)
sudo apt update
sudo apt install -y libnginx-mod-http-geoip2
ls /etc/nginx/modules-enabled/ | grep geoip2       # модуль должен быть включён

# 2. база стран (~8 МБ, CC BY 4.0, без регистрации)
sudo bash deploy/geoip/update_geoip_db.sh

# 3. конфиги nginx
sudo mkdir -p /etc/nginx/snippets
sudo cp deploy/nginx-snippets/*.conf /etc/nginx/snippets/
sudo cp /etc/nginx/sites-available/edo "/etc/nginx/sites-available/edo.bak-$(date +%F)"
sudo cp deploy/nginx.conf /etc/nginx/sites-available/edo
sudo nginx -t && sudo systemctl reload nginx
```

> **`deploy/nginx.conf` — это конфиг САЙТА, а не главный конфиг nginx.**
> Он копируется **только** в `/etc/nginx/sites-available/<имя сайта>`.
> Если скопировать его в `/etc/nginx/nginx.conf`, nginx потеряет
> `include sites-enabled/*` (отвалятся все остальные сайты сервера),
> `include conf.d/*` и `include modules-enabled/*` — а без последнего модуль
> `geoip2` не загрузится и `nginx -t` упадёт на `unknown directive "geoip2"`.
> Как починить — в разделе «Грабли» ниже.

</details>

Проверить, что сам сервер (localhost) по-прежнему видит сайт:

```bash
curl -s -o /dev/null -w 'HTTP %{http_code}\n' https://toredo.mroo-snpm.ru/
# ожидаем: HTTP 200
```

---

## Как это работает

Два независимых уровня. Первый реально закрывает доступ, второй — страховка.

| Уровень | Что делает | Где настраивается |
|---|---|---|
| **1. nginx** | определяет страну клиента по IP и **не пускает** его дальше: ни файлов сборки, ни API | `deploy/nginx-snippets/edo-geo-block.conf` + `edo-geo-block-server.conf` |
| **2. Бэкенд** | если запрос всё-таки дошёл до FastAPI — отклоняет его по заголовку `X-Geo-Country`, который проставляет nginx | `GEO_BLOCK_ENABLED` в `backend/.env`, `GeoBlockMiddleware` |

Второй уровень нужен на случай, когда первый не сработал: не установлен модуль
`geoip2`, устарела база, кто-то обратился к бэкенду напрямую. Он **выключен по
умолчанию** — включайте, когда nginx уже настроен.

Заголовок `X-Geo-Country` подделать снаружи нельзя: nginx ставит его через
`proxy_set_header`, а эта директива **перезаписывает** одноимённый заголовок
клиента.

### Что НЕ блокируется

* `/.well-known/...` — ACME-челлендж certbot. Иначе через 90 дней сертификат
  не продлится.
* `/geo-fonts/...` — шрифт Lato для самой страницы-заглушки
  (`deploy/geoip/fonts/`). Заблокированный клиент по определению не может
  взять файл с нашего домена, поэтому этот путь — исключение. Без него
  «Доступ ограничен» отрисуется системным шрифтом.
* Доверенные IP (`$geo_trusted`): `127.0.0.1`, `::1`, `31.41.60.0/24` — то есть
  systemd, мониторинг на самом сервере и подсеть админки.
* `/api/health` на уровне бэкенда — от него зависит `ExecStartPost` в
  `edo-backend.service`.

### Шрифт страницы-заглушки

Страница отдаётся шрифтом **Lato** — тем же, что объявлен в приложении
(`frontend/src/index.css`). Файлы лежат в репозитории, в
`deploy/geoip/fonts/`, и отдаются nginx по пути `/geo-fonts/`.

Почему не Google Fonts: там у Lato есть только сабсеты `latin` и `latin-ext`,
**кириллицы нет** — русский текст молча отрисовался бы системным шрифтом.
Взята официальная сборка Lato v3.100 (tyPoland, SIL OFL 1.1), в которой
кириллица есть. Подробности и команды пересборки — `deploy/geoip/fonts/README.md`.

---

## Проверка, что ограничение работает

**Способ 1 (надёжный, без внешних сервисов) — временно вывернуть правило наизнанку.**

Вы находитесь в России, поэтому для самопроверки сделайте так, чтобы
заблокированными оказались именно вы:

```bash
sudo nano /etc/nginx/snippets/edo-geo-block.conf
```

в блоке `map $geo_country $geo_allowed` поменяйте:

```nginx
    default 0;      ->   default 1;
    RU 1;           ->   RU 0;
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Откройте сайт в браузере — должна показаться страница «Доступ ограничен».
**Обязательно верните значения обратно** (`default 0;` / `RU 1;`) и снова
перезагрузите nginx.

**Способ 2** — попросить коллегу за границей или использовать любой сервис
проверки доступности из другой страны.

Проверить, что отдаётся шрифт заглушки (тип обязан быть `font/woff2`,
иначе браузер вправе шрифт не применить):

```bash
curl -s -o /dev/null -w 'HTTP %{http_code}  %{content_type}\n' \
  https://toredo.mroo-snpm.ru/geo-fonts/lato-400.woff2
# ожидаем: HTTP 200  font/woff2
```

**Посмотреть, какую страну определил nginx** (временно, потом убрать):

```bash
sudo nano /etc/nginx/sites-available/edo
# в блок server{} (рядом с server_tokens off) добавить:
#     add_header X-Geo-Country $geo_country always;
sudo nginx -t && sudo systemctl reload nginx
curl -sI https://toredo.mroo-snpm.ru/ | grep -i x-geo-country
```

---

## Изменить список стран

Один файл — `/etc/nginx/snippets/edo-geo-block.conf` (в репозитории —
`deploy/nginx-snippets/edo-geo-block.conf`):

```nginx
map $geo_country $geo_allowed {
    default 0;      # страна не определилась -> ЗАПРЕЩАЕМ
    RU 1;           # Россия
    BY 1;           # Беларусь
    KZ 1;           # Казахстан
    AM 1;           # ← пример: добавить Армению
}
```

Коды — ISO 3166-1 alpha-2. После правки: `sudo nginx -t && sudo systemctl reload nginx`.

**Если нужно пропускать «неизвестные» IP** (например, у части пользователей
оператор не определяется базой) — поставьте `default 1;`. Тогда ограничение
начнёт работать только для стран, перечисленных явно.

То же самое для второго уровня — в `backend/.env`:

```bash
GEO_BLOCK_ENABLED=true
GEO_ALLOWED_COUNTRIES=RU,BY,KZ
```

---

## Добавить доверенный IP (мониторинг, интеграция)

Если есть внешний мониторинг (UptimeRobot и подобные) или интеграция с чужого
сервера — их IP нужно внести в `$geo_trusted`, иначе они получат 403:

```nginx
geo $geo_trusted {
    default 0;
    127.0.0.1/32    1;
    ::1/128         1;
    31.41.60.0/24   1;
    203.0.113.7/32  1;   # ← IP мониторинга
}
```

---

## Обновление базы стран

DB-IP публикует новую базу раз в месяц. Настроить ежемесячный запуск
(1-е число, 04:30):

```bash
sudo crontab -e
# добавить строку:
30 4 1 * * /var/www/edo/deploy/geoip/update_geoip_db.sh --quiet >> /var/log/edo-geoip.log 2>&1
```

Проверить состояние базы:

```bash
sudo bash /var/www/edo/deploy/geoip/update_geoip_db.sh --check
```

nginx перечитывает файл сам (`auto_reload 1d` в сниппете), рестарт не нужен.
Установка файла атомарная, поэтому nginx никогда не увидит «половину» базы.

---

## Выключить или откатить

```bash
# вариант 1: убрать подключение фрагментов (файлы сниппетов можно оставить)
sudo nano /etc/nginx/sites-available/edo
#   закомментировать строку  include /etc/nginx/snippets/edo-geo-block.conf;
#   и строку               include /etc/nginx/snippets/edo-geo-block-server.conf;
sudo nginx -t && sudo systemctl reload nginx

# вариант 2: вернуть конфиг целиком
sudo cp /etc/nginx/sites-available/edo.bak-<дата> /etc/nginx/sites-available/edo
sudo nginx -t && sudo systemctl reload nginx
```

На бэкенде — `GEO_BLOCK_ENABLED=false` в `backend/.env` и
`sudo systemctl restart edo-backend`.

---

## Если nginx.conf перезаписан конфигом сайта

**Симптом:** `nginx -t` падает на `unknown directive "geoip2"` (или на
`"server" directive is not allowed here`), хотя модуль установлен.

**Причина:** `deploy/nginx.conf` — это конфиг **сайта**. В нём нет секций
`events {}` и `http {}`; он рассчитан на то, что его подключит главный конфиг
из `sites-enabled/`. Если положить его в `/etc/nginx/nginx.conf`, nginx теряет:

| Что теряется | Последствие |
|---|---|
| `include /etc/nginx/sites-enabled/*;` | отваливаются **все остальные сайты** сервера (например, `school.mroo-snpm.ru`) |
| `include /etc/nginx/modules-enabled/*.conf;` | не грузится модуль `geoip2` → `unknown directive "geoip2"` |
| `include /etc/nginx/conf.d/*.conf;` | отваливаются общие настройки |

Сайт при этом **не падает**: `reload` не состоялся, nginx продолжает работать
на прежнем конфиге. Но при **перезагрузке сервера** nginx не запустится —
поэтому чинить нужно сразу.

**Проверка одной командой:**

```bash
grep -c worker_processes /etc/nginx/nginx.conf
```

`0` — значит в `nginx.conf` лежит конфиг сайта. В настоящем главном конфиге
`worker_processes` есть всегда.

**Лечение (копировать целиком):**

```bash
# 1. сохранить текущее состояние, ничего не удаляя
sudo mkdir -p /root/nginx-recovery
sudo cp -a /etc/nginx/nginx.conf /root/nginx-recovery/nginx.conf.wrong-copy

# 2. убрать ошибочно скопированный файл в сторону
sudo mv /etc/nginx/nginx.conf /etc/nginx/nginx.conf.wrong-copy

# 3. вернуть оригинал из пакета nginx
cd /tmp && apt-get download nginx && dpkg-deb -x nginx_*.deb nginx-pkg
sudo cp /tmp/nginx-pkg/etc/nginx/nginx.conf /etc/nginx/nginx.conf

# 4. проверить, что вернулись все три include
grep -nE '^\s*include' /etc/nginx/nginx.conf

# 5. проверить синтаксис и перезагрузить
sudo nginx -t && sudo systemctl reload nginx
```

> `apt-get install --reinstall nginx` здесь **не поможет**: файл в системе
> существует (просто не тот), и dpkg оставит его как «изменённый вручную».
> Поэтому оригинал берётся прямо из `.deb`.
>
> Если скачать пакет нельзя (нет сети или nginx не из apt) — вот минимальный
> рабочий главный конфиг, его достаточно:
>
> ```nginx
> user www-data;
> worker_processes auto;
> pid /run/nginx.pid;
> include /etc/nginx/modules-enabled/*.conf;
>
> events { worker_connections 768; }
>
> http {
>     include /etc/nginx/mime.types;
>     default_type application/octet-stream;
>     ssl_protocols TLSv1.2 TLSv1.3;
>     access_log /var/log/nginx/access.log;
>     error_log /var/log/nginx/error.log;
>     gzip on;
>     include /etc/nginx/conf.d/*.conf;
>     include /etc/nginx/sites-enabled/*;
> }
> ```
>
> Если в вашем прежнем `nginx.conf` были свои настройки внутри `http {}`
> (например, `client_max_body_size` или `server_names_hash_bucket_size`),
> их придётся вернуть руками — они в этом шаблоне не восстановятся.

После этого конфиг сайта ставится уже **правильно**:

```bash
sudo bash deploy/geoip/install_geo_block.sh
```

---

## Грабли

* **`nginx -t` падает: `open() "/var/lib/nginx-geoip/dbip-country-lite.mmdb" failed`.**
  Файла базы нет. Сначала `sudo bash deploy/geoip/update_geoip_db.sh`, потом
  ставить конфиг. Сайт при этом не падает — работает на прежнем конфиге.
* **`nginx -t` падает: `unknown directive "geoip2"`.** Две причины, проверять
  в этом порядке:
  1. **Не установлен модуль** — `sudo apt install libnginx-mod-http-geoip2`,
     затем `ls /etc/nginx/modules-enabled/ | grep geoip2`.
  2. **Главный конфиг потерял `include modules-enabled/*`** — почти всегда
     потому, что в `/etc/nginx/nginx.conf` случайно скопировали
     `deploy/nginx.conf` (конфиг сайта). Проверка:
     `grep -c worker_processes /etc/nginx/nginx.conf` — если `0`, это не
     главный конфиг. Лечение — раздел «Если nginx.conf перезаписан» ниже.
* **`nginx -t` падает: `unknown directive "set"` / `"map"`.** Скорее всего
  фрагмент `edo-geo-block.conf` попал внутрь `server{}`. Он обязан быть в
  контексте `http` — то есть в файле сайта **до** первого `server {`.
* **Все получают 403, включая вас.** Значит `$geo_country` не определяется.
  Почему: `$remote_addr` — это адрес того, кто стучится в nginx. Если перед
  nginx стоит ещё один прокси/CDN, там будет его адрес. Тогда нужен модуль
  real_ip:
  ```nginx
  set_real_ip_from <IP прокси>;
  real_ip_header X-Forwarded-For;
  ```
  Быстрая диагностика — временный `add_header X-Geo-Country $geo_country always;`
  (см. раздел «Проверка»). Если видите `XX` или пусто — база не находит IP.
* **Ложное срабатывание у конкретного пользователя.** Бесплатная база DB-IP Lite
  содержит ~717 тыс. диапазонов и ошибается чаще коммерческой. Если человек
  реально находится в разрешённой стране, а получает 403 — проверьте его IP
  вручную (например, на db-ip.com) и при необходимости добавьте его IP в
  `$geo_trusted`.
* **IPv6.** База покрывает и IPv6, но если у клиента адрес из диапазона, которого
  нет в базе, он получит 403. Тот же `default 1;` решает это ценой ослабления
  правила.
* **Не забудьте про внешний мониторинг** — он тоже «клиент из интернета» и
  получит 403, если его IP не в `$geo_trusted`.
* **Страница-заглушка должна быть читаема пользователем nginx:**
  ```bash
  ls -l /var/www/edo/deploy/geoip/geo-blocked.html   # ожидаем -rw-r--r--
  ```
* **Адрес поддержки на заглушке — заглушка-заглушка.** В
  `deploy/geoip/geo-blocked.html` ссылка «Служба поддержки» ведёт на
  `mailto:support@mroo-snpm.ru`. Замените на реальную почту или телефон.
* **Атрибуция DB-IP обязательна.** База распространяется по лицензии
  Creative Commons Attribution 4.0, поэтому ссылка «IP Geolocation by DB-IP»
  в подвале страницы-заглушки должна остаться.
* **`update_geoip_db.sh` в первые дни месяца.** Свежий релиз DB-IP появляется не
  строго 1-го числа, поэтому скрипт сам пробует предыдущие месяцы и не падает
  с 404.

---

## Файлы

| Файл | Назначение |
|---|---|
| `deploy/geoip/geo-blocked.html` | страница «Доступ ограничен» (отдаёт nginx) |
| `deploy/geoip/fonts/` | шрифт Lato для заглушки (отдаётся по `/geo-fonts/`) + лицензия OFL |
| `deploy/geoip/update_geoip_db.sh` | загрузка/обновление базы стран DB-IP Lite |
| `deploy/geoip/install_geo_block.sh` | установка всего сразу: проверки, модуль, база, конфиги, откат при ошибке |
| `deploy/nginx-snippets/edo-geo-block.conf` | GeoIP2, список стран, доверенные IP, ACME (контекст `http`) |
| `deploy/nginx-snippets/edo-geo-block-server.conf` | логика запрета + `error_page` (внутри `server{}`) |
| `backend/app/core/middleware.py` | `GeoBlockMiddleware` — вторая линия обороны |
| `backend/app/config.py` | `GEO_BLOCK_ENABLED`, `GEO_ALLOWED_COUNTRIES`, … |
| `frontend/src/api/edoApi.ts` | перехват `geo_blocked` → переход на заглушку |
| `backend/_smoke_security.py` | раздел 9 — автотест гео-ограничения |
