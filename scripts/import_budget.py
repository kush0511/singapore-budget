#!/usr/bin/env python3
"""Import a pinned annual MOF publication, fail closed when its structure changes.

Uses only Python's standard library and Poppler's pdftotext. Normal builds read
committed JSON and do not fetch data. See docs/DATA.md for the annual workflow.
"""
from __future__ import annotations
import argparse
from copy import deepcopy
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
MILLION = 1_000_000

def number(value: str) -> int:
    value = value.strip()
    if value in ('–', '-', '—'):
        return 0
    return int(Decimal(value.replace(',', '').replace('(', '-').replace(')', '')))

def fields(line: str) -> list[str]:
    return re.split(r'\s{2,}', line.strip())

def unique(items, context):
    if len(items) != 1:
        raise ValueError(f'{context}: expected exactly one match, found {len(items)}. Review the new source structure.')
    return items[0]

def pdf_text(path):
    return subprocess.check_output(['pdftotext', '-layout', str(path), '-'], text=True)

def import_budget(config, fetch=False):
    year=config['fiscalYear']
    if config['basis']!='Estimated':
        raise ValueError('This annual importer selects the current-year Estimated column; a different basis needs an explicitly reviewed parser.')
    source_paths={}
    for source in config['sources']:
        path=ROOT/source['file']
        if fetch:
            path.parent.mkdir(parents=True,exist_ok=True)
            with urllib.request.urlopen(source['url'],timeout=90) as response:
                body=response.read()
            # JSON API snapshots are canonicalized, excluding transient HTTP headers.
            if path.suffix=='.json':
                body=(json.dumps(json.loads(body),indent=2)+'\n').encode()
            digest=hashlib.sha256(body).hexdigest()
            if digest!=source['sha256']:
                raise ValueError(f"{source['id']}: downloaded SHA256 differs from pin ({digest}); inspect new publication before updating its hash")
            path.write_bytes(body)
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        if digest!=source['sha256']:
            raise ValueError(f"{source['id']}: source SHA256 mismatch")
        source_paths[source['id']]=path
    estimates=pdf_text(source_paths['mof-estimates'])
    analysis=pdf_text(source_paths['mof-analysis'])
    revenue_text=estimates.split('REVENUE ESTIMATES\n',1)[1].split('EXPENDITURE ESTIMATES\n',1)[0]
    revenue=[]
    for item in config['revenue']:
        matches=[fields(line) for line in revenue_text.splitlines() if line.split() and line.split()[0]==item['code']]
        row=unique(matches,f"Revenue {item['code']}")
        if len(row)!=8 or row[1]!=item['sourceLabel']:
            raise ValueError(f"Unexpected revenue columns for {item['code']}: {row}")
        # Actual prior-prior FY; estimated prior FY; revised prior FY; current estimate.
        amount=number(row[5])
        revenue.append({'id':item['id'],'label':item['label'],'amount':amount,'sourceId':'mof-estimates','sourcePage':config['locators']['revenuePages'],'sourceCode':item['code'],'precision':1000})
    fiscal_table=analysis.split(f'Table 3.1a: Overall Fiscal Position for FY2020 to FY{year} ($ million)',1)[1].split('Note: Figures may not add up',1)[0]
    fiscal={}
    for key,label in config['fiscalItems'].items():
        matches=[fields(line) for line in fiscal_table.splitlines() if fields(line)[0]==label]
        row=unique(matches,f'Fiscal {label}')
        fiscal[key]=number(row[-1])*MILLION
    sector_text=estimates.split(f'TOTAL EXPENDITURE FOR FY{year} BY SECTOR AND MINISTRY',1)[1].split('TOTAL EXPENDITURE',1)[0]
    sector_rows=[]
    for line in sector_text.splitlines():
        row=fields(line)
        if len(row)==7 and re.fullmatch(r'[\d,]+', row[1]):
            label=re.sub(r'\s+[123]$', '',row[0])
            sector_rows.append((label,{'operating':number(row[1]),'development':number(row[3]),'amount':number(row[5])}))
    sectors=[]
    cursor=0
    for sector in config['sectors']:
        expected=[sector]+sector['ministries']
        parsed=[]
        for item in expected:
            label,amounts=sector_rows[cursor]
            if label!=item['sourceLabel']:
                raise ValueError(f"Sector parser expected {item['sourceLabel']}, found {label}")
            parsed.append({'id':item['id'],'label':item['label'],**amounts,'sourceId':'mof-estimates','sourcePage':config['locators']['sectorPage'],'precision':100,**({'note':item['note']} if 'note' in item else {})})
            cursor+=1
        sectors.append({**parsed[0],'ministries':parsed[1:]})
    if cursor!=len(sector_rows):
        raise ValueError('Unparsed expenditure rows; review new publication')
    totals=deepcopy(fiscal)
    for key,field in [('totalExpenditure','amount'),('operatingExpenditure','operating'),('developmentExpenditure','development')]:
        totals[key]=sum(sector[field] for sector in sectors)
    totals['operatingRevenue']=sum(item['amount'] for item in revenue)
    # Exact Head Z direct-transfer amount. Rounded summary values are kept separately.
    direct_rows=[fields(line) for line in estimates.splitlines() if re.match(r'^\s*3700\s+Special Transfers\s+',line)]
    direct_values={number(row[5]) for row in direct_rows if len(row)==8}
    if len(direct_values)!=1:
        raise ValueError(f'Could not uniquely parse current-year special transfers: {direct_values}')
    totals['directTransfers']=direct_values.pop()
    fund_table=analysis.split('Top-ups to Statutory and Trust Funds in FY'+str(year),1)[1].split('Total',1)[0]
    for item in config['fundTopups']:
        row=unique([fields(line) for line in fund_table.splitlines() if fields(line)[0]==item['label']], 'Fund top-up '+item['label'])
        if number(row[-1])*MILLION!=item['amount']:
            raise ValueError('Configured fund top-up differs from MOF: '+item['label'])
    totals['fundTopups']=sum(item['amount'] for item in config['fundTopups'])
    totals['specialTransfers']=totals['directTransfers']+totals['fundTopups']
    totals['totalRevenue']=totals['operatingRevenue']+totals['nirc']
    totals['totalOutlays']=totals['totalExpenditure']+totals['specialTransfers']
    residual=totals['totalRevenue']-totals['totalOutlays']-totals['overallBudgetBalance']
    precision={key:1000000 for key in fiscal}
    precision.update({'operatingRevenue':1000,'totalExpenditure':100,'operatingExpenditure':100,'developmentExpenditure':100,'directTransfers':100,'fundTopups':100,'specialTransfers':100,'totalRevenue':1000000,'totalOutlays':100})
    datagov={name:json.loads(source_paths[f'data-gov-{name}'].read_text())['result']['records'] for name in ['revenue','fiscal']}
    for name,rows in datagov.items():
        years={int(row.get('financial_year',row.get('year_of_balance'))) for row in rows}
        if year not in years:
            raise ValueError(f'data.gov.sg {name} does not contain FY{year}; update the annual config/source choice explicitly')
    current_revenue=[r for r in datagov['revenue'] if r['financial_year']==str(year) and r['actual_revised_estimated']==config['basis']]
    used_types=[]
    for item, imported in zip(config['revenue'],revenue):
        rows=[unique([r for r in current_revenue if r['type']==kind], f'data.gov revenue {kind}') for kind in item['dataGovTypes']]
        published=sum(number(row['amount_in_millions'])*MILLION for row in rows)
        if abs(imported['amount']-published)>len(rows)*500000:
            raise ValueError(f"data.gov.sg and precise MOF estimates disagree for {item['label']}")
        used_types.extend(item['dataGovTypes'])
    if len(used_types)!=len(set(used_types)) or set(used_types)!={r['type'] for r in current_revenue}:
        raise ValueError('data.gov revenue types are duplicated or unaccounted for')
    current_fiscal=[r for r in datagov['fiscal'] if r['year_of_balance']==str(year) and r['actual_revised_estimated']==config['basis']]
    crosswalk={'operatingRevenue':'Operating Revenue','totalExpenditure':'Total Expenditure','directTransfers':'Special Transfers Excluding Top-ups to Statutory and Trust Funds','fundTopups':'Top-ups to Statutory and Trust Funds','nirc':'Net Investment Income/Returns Contribution','overallBudgetBalance':'Overall Budget Balance','capitalisation':'Capitalisation of Nationally Significant Infrastructure','depreciation':'Depreciation of Nationally Significant Infrastructure','singaInterest':'SINGA Interest Costs and Loan Expenses','overallFiscalPosition':'Overall Fiscal Position','primaryBalance':'Primary Balance','basicBalance':'Basic Balance'}
    for key,label in crosswalk.items():
        row=unique([r for r in current_fiscal if r['item']==label],f'data.gov fiscal {label}')
        if number(row['amount_in_millions'])*MILLION!=fiscal[key]:
            raise ValueError(f'data.gov.sg and MOF disagree for {key}')
    result={'schemaVersion':1,'unit':'SGD','fiscalYear':year,'basis':config['basis'],'budgetDate':config['budgetDate'],'retrievedAt':config['retrievedAt'],'period':config['period'],'vintageNote':config['vintageNote'],'sourcePage':config['sourcePage'],'sources':config['sources'],'totals':totals,'precision':precision,'publishedRoundedTotals':fiscal,'revenue':revenue,'sectors':sectors,'specialTransfers':[{'id':'fund-topups','label':'Top-ups to statutory & trust funds','amount':totals['fundTopups'],'sourceId':'mof-estimates','sourcePage':config['locators']['fundTopupPage'],'precision':100,'children':[{**item,'sourceId':'mof-analysis','sourcePage':config['locators']['fundDetailPage'],'precision':1000000} for item in config['fundTopups']]},{'id':'direct-transfers','label':'Transfers to Singaporeans & businesses','amount':totals['directTransfers'],'sourceId':'mof-estimates','sourcePage':config['locators']['directTransferPage'],'precision':100}],'reconciliation':{'id':'published-rounding','label':'Published rounding','role':'reconciliation','amount':residual,'includedInSpending':False,'maximumAbsoluteAmount':1000000,'note':'The MOF publishes NIRC and overall budget balance to the nearest S$1 million. This difference reconciles those rounded figures with the more precise revenue and expenditure estimates. It is not government spending.'},'notes':['Flows show a pooled budget. Revenue sources are not earmarked to the ministries they visually connect to.','Ministry figures are total expenditure by sector from the MOF summary, excluding loans, land-related expenditure and other non-expenditure outlays. Manpower and Digital Development and Information are split across sectors by programme; their portions are not whole-ministry totals.','Special transfers include fund top-ups, not subsequent spending from those funds. Counting both would double count.','Land sales and borrowing are not operating revenue. Net Investment Returns Contribution is included separately; gross investment and interest income is not added.','The overall budget balance precedes SINGA capitalisation and financing adjustments. The overall fiscal position includes those adjustments.','Fees and charges include vehicle quota premiums (COE). They are combined to preserve the exact published category total. Changes in scope make FY2025/FY2026 fees and other revenue comparisons unsuitable without adjustment.','Widths use source amounts in Singapore dollars. Displayed billions and percentages are rounded.']}
    return result

def annual_index(data_dir: Path) -> list[dict]:
    """Index only generated annual datasets, preserving their own basis labels."""
    labels = {'Estimated': 'Estimates', 'Revised': 'Revised estimates', 'Actual': 'Actuals'}
    entries = []
    for path in sorted(data_dir.glob('budget-*.json')):
        match = re.fullmatch(r'budget-(\d{4})\.json', path.name)
        if match is None:
            raise ValueError(f'Unexpected annual dataset filename: {path.name}')
        data = json.loads(path.read_text())
        year = int(match.group(1))
        if data['fiscalYear'] != year or data['basis'] not in labels:
            raise ValueError(f'{path.name}: fiscal year or basis does not match the annual registry')
        entries.append({'year': year, 'file': path.name, 'label': f"FY{year} · {labels[data['basis']]}"})
    return sorted(entries, key=lambda item: item['year'], reverse=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',type=Path,default=ROOT/'data/config/2026.json')
    parser.add_argument('--fetch',action='store_true',help='Download source files and require the pinned SHA256 hashes')
    parser.add_argument('--check',action='store_true',help='Verify output equals committed generated data without writing')
    args=parser.parse_args()
    config=json.loads(args.config.read_text())
    result=import_budget(config,args.fetch)
    rendered=json.dumps(result,indent=2,ensure_ascii=False)+'\n'
    out=ROOT/f"public/data/budget-{config['fiscalYear']}.json"
    if args.check:
        if out.read_text()!=rendered:
            raise SystemExit(f'{out.relative_to(ROOT)} is stale; run the importer')
    else:
        out.parent.mkdir(parents=True,exist_ok=True)
        out.write_text(rendered)
    index_path = out.parent/'index.json'
    index_rendered = json.dumps(annual_index(out.parent), indent=2, ensure_ascii=False)+'\n'
    if args.check:
        if not index_path.exists() or index_path.read_text()!=index_rendered:
            raise SystemExit(f'{index_path.relative_to(ROOT)} is stale; run the importer')
    else:
        index_path.write_text(index_rendered)
    print(f"FY{config['fiscalYear']} {config['basis']}: {len(result['revenue'])} revenue categories, {len(result['sectors'])} sectors; rounding reconciliation S${result['reconciliation']['amount']:,}")

if __name__=='__main__':
    main()
