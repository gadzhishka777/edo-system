"""Выгрузка вакансий организаций в ЕИС «ОбрПортал» из командной строки.

Зачем, если в интерфейсе есть кнопка: первичное заполнение портала после
подключения школы и повторная выгрузка после массовых правок — без захода
в каждую организацию под админом.

Запуск (из каталога backend, окружение проекта):
    ../venv/bin/python tools/obrportal_push_vacancies.py --list
    ../venv/bin/python tools/obrportal_push_vacancies.py --all
    ../venv/bin/python tools/obrportal_push_vacancies.py --org 6
    ../venv/bin/python tools/obrportal_push_vacancies.py --all --dry-run

--dry-run показывает, что уйдёт и в какую школу, но НЕ отправляет.
Код возврата 1, если хотя бы одна организация выгрузилась с ошибкой.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.models.mail import Organization  # noqa: E402
from app.services import obrportal_vacancies as obrportal  # noqa: E402


async def list_orgs(db) -> None:
    schools = await obrportal.fetch_portal_schools(force=True)
    orgs = (await db.execute(select(Organization).order_by(Organization.id))).scalars().all()
    print(f"Школ на портале: {len(schools)}\n")
    print(f"{'id':>4}  {'школа?':6} {'привязка':8} {'портал':>7}  организация")
    for org in orgs:
        pid, pname, how = obrportal.resolve_portal_org(org, schools)
        print(
            f"{org.id:>4}  {'да' if org.is_school else 'нет':6} {how:8} {str(pid or '-'):>7}  {org.name}"
        )
    print("\nВыгрузка идёт только по организациям с привязкой (manual/auto).")


async def push(db, org, dry_run: bool) -> bool:
    schools = await obrportal.fetch_portal_schools()
    pid, pname, how = obrportal.resolve_portal_org(org, schools)
    vacancies = await obrportal.collect_org_vacancies(db, org.id)
    items = obrportal.build_vacancy_items(vacancies)

    if not pid:
        print(f"  ✗ {org.name}: не сопоставлена со школой портала")
        return False

    print(f"  → {org.name} -> [{pid}] {pname} ({how}), вакансий: {len(items)}")
    if dry_run:
        for it in items:
            print(f"      · {it['name']} | {it['rang']} | {it['workload']}")
        return True

    try:
        result = await obrportal.push_org_vacancies(db, org)
    except obrportal.ObPortalError as exc:
        print(f"  ✗ ошибка: {exc}")
        return False
    print(
        f"  ✓ отправлено {result['sent']}, добавлено {result['added']}, "
        f"удалено {result['deleted']}, пропущено {result['skipped']}"
    )
    return True


async def main(args) -> int:
    if not settings.OBRPORTAL_ENABLED:
        print("Выгрузка выключена: OBRPORTAL_ENABLED=false в backend/.env")
        return 2
    if not settings.obrportal_configured:
        print("Не заданы ключи: OBRPORTAL_APP_ID/SECRET или ESA_APP_ID/SECRET")
        return 2

    async with AsyncSessionLocal() as db:
        # CLI не проходит через lifespan приложения, поэтому миграцию колонок
        # запускаем сами — иначе на неперезапущенном бэкенде упадём на SELECT.
        from app.main import migrate_obrportal_columns

        await migrate_obrportal_columns()

        if args.list:
            await list_orgs(db)
            return 0

        if args.org:
            org = (
                await db.execute(select(Organization).where(Organization.id == args.org))
            ).scalar_one_or_none()
            if not org:
                print(f"Организация id={args.org} не найдена")
                return 2
            orgs = [org]
        else:
            orgs = (
                await db.execute(
                    select(Organization)
                    .where(Organization.is_school.is_(True))
                    .order_by(Organization.id)
                )
            ).scalars().all()

        print(f"Организаций к выгрузке: {len(orgs)}" + (" (dry-run)" if args.dry_run else ""))
        ok = True
        for org in orgs:
            ok = await push(db, org, args.dry_run) and ok
        return 0 if ok else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Выгрузка вакансий в ЕИС «ОбрПортал»")
    parser.add_argument("--all", action="store_true", help="все организации-школы")
    parser.add_argument("--org", type=int, help="только организация с указанным id")
    parser.add_argument("--list", action="store_true", help="показать привязки и выйти")
    parser.add_argument("--dry-run", action="store_true", help="ничего не отправлять")
    sys.exit(asyncio.run(main(parser.parse_args())))
