# Шрифт Lato для страницы «Доступ ограничен»

Отсюда nginx отдаёт шрифт по пути **`/geo-fonts/`**
(`location /geo-fonts/` в `deploy/nginx-snippets/edo-geo-block-server.conf`).

| Файл | Вес | Где используется на заглушке |
|---|---|---|
| `lato-400.woff2` | 400 | основной текст, список, подвал |
| `lato-500.woff2` | 500 | кнопка «Обновить» |
| `lato-700.woff2` | 700 | заголовок «Доступ ограничен» |

## Почему файлы лежат здесь, а не берутся из Google Fonts

В Google Fonts у Lato есть только сабсеты **latin** и **latin-ext** —
**кириллицы там нет**. Подключи мы шрифт оттуда, русский текст молча
отрисовался бы системным шрифтом, и «шрифт Lato» получился бы только
на бумаге. Проверено запросом к API:

```bash
curl -s "https://fonts.googleapis.com/css2?family=Lato&display=swap" | grep -c cyrillic
# 0
```

Поэтому здесь лежит официальная сборка Lato **v3.100** (tyPoland),
в которой кириллица есть: «100+ Latin-based languages, 50+ Cyrillic-based
languages» ([latofonts/lato-source](https://github.com/latofonts/lato-source)).

## Как получены файлы (воспроизводимо)

```bash
BASE=https://raw.githubusercontent.com/latofonts/lato-source/master/build/Lato3Upr2M/ds-ufo/masters
curl -fLO $BASE/Lato-Regular.ttf   # 400
curl -fLO $BASE/Lato-Medium.ttf    # 500
curl -fLO $BASE/Lato-Bold.ttf      # 700

pip install fonttools brotli
UNI='U+0020-007E,U+00A0,U+00AB,U+00BB,U+2013-2014,U+2018-2019,U+201C-201D,U+2026,U+0400-045F,U+2116'
python -m fontTools.subset Lato-Regular.ttf --unicodes="$UNI" --flavor=woff2 \
    --layout-features='kern,liga,clig,calt,locl' --output-file=lato-400.woff2
# то же для Medium -> lato-500.woff2 и Bold -> lato-700.woff2
```

Субсет оставлен по минимуму: ASCII, кириллица (U+0400–045F), кавычки-ёлочки,
тире, многоточие и знак №. Каждый файл — около 20 КБ вместо 720 КБ исходного TTF.

Проверить, что в файле есть кириллица:

```bash
python -c "
from fontTools.ttLib import TTFont
cm = TTFont('lato-400.woff2').getBestCmap()
print('Д ->', cm.get(0x0414), '| ё ->', cm.get(0x0451))
"
```

## Лицензия

Lato распространяется по **SIL Open Font License 1.1** — текст в
[`LICENSE-lato.txt`](LICENSE-lato.txt). Он обязан лежать рядом со шрифтами:
OFL требует сопровождать файлы лицензией. Коммерческое использование и
встраивание в сайт разрешены; Reserved Font Name «Lato» нельзя использовать
для изменённых версий (мы шрифт не меняли, только вырезали лишние глифы).

## Грабли

* **Путь `/geo-fonts/` обязан быть в исключениях гео-блокировки**
  (`map $request_uri $geo_is_exempt` в `edo-geo-block.conf`). Иначе браузер
  получит 403 на сам шрифт — страницу-то он показывает, а файл с того же
  домена ему недоступен.
* **Не переименовывать файлы** без правки `@font-face` в
  `deploy/geoip/geo-blocked.html` и `location /geo-fonts/`.
* **Тип содержимого задаётся явно** (`default_type font/woff2`) — в mime.types
  старых версий nginx типа для `woff2` может не быть, а отдавать шрифт как
  `application/octet-stream` рискованно: браузер вправе его не применить.
* **Вес 600 у Lato отсутствует.** У семейства есть 100/300/400/500/700/900.
  Если в CSS запросить 600, браузер по правилам подбора возьмёт 700.
