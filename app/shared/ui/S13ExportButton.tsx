import { FileDown } from 'lucide-react'
import { Link } from 'react-router'
import * as m from '~/i18n/paraglide/messages'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'

export default function S13ExportButton({ theocraticYear }: { theocraticYear: number }) {
  const theocraticYearLabel = `${theocraticYear}/${theocraticYear + 1}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" title={m.export_button_title()}>
          <FileDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link
            to={`/territories/attributions/export/${theocraticYear}/xlsx`}
            title={m.export_s13_excel_title({ theocraticYear: theocraticYearLabel })}
            reloadDocument
          >
            {m.export_s13_excel({ theocraticYear: theocraticYearLabel })}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            to={`/territories/attributions/export/${theocraticYear}/pdf`}
            title={m.export_s13_pdf_title({ theocraticYear: theocraticYearLabel })}
            reloadDocument
          >
            {m.export_s13_pdf({ theocraticYear: theocraticYearLabel })}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
