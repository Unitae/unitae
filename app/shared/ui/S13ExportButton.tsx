import { FileDown } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '~/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/shared/ui/dropdown-menu'

export default function S13ExportButton({ theocraticYear }: { theocraticYear: number }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" title="Télécharger les exports">
          <FileDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link
            to={`/territories/attributions/export/${theocraticYear}/xlsx`}
            title={`Télécharger le fichier S-13 au format Excel pour l'année ${theocraticYear}`}
            reloadDocument
          >
            Exporter la S-13 (Excel)
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            to={`/territories/attributions/export/${theocraticYear}/pdf`}
            title={`Télécharger le fichier S-13 au format PDF pour l'année ${theocraticYear}`}
            reloadDocument
          >
            Exporter la S-13 (PDF)
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
