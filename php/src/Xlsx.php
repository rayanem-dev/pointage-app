<?php
/** Écriture de classeurs Excel (.xlsx) sans bibliothèque : feuilles, styles, fusions, formules, images (ZipArchive). */
final class Xlsx {
    private static function x($s): string { return htmlspecialchars((string)$s, ENT_XML1 | ENT_QUOTES, 'UTF-8'); }
    private static function col(int $i): string { $s = ''; for ($n = $i; $n > 0; $n = intdiv($n - 1, 26)) $s = chr(65 + (($n - 1) % 26)) . $s; return $s; }
    private static function rgb(?string $h): string { return 'FF' . strtoupper(ltrim((string)$h, '#')); }

    /** @param Sheet[] $sheets */
    public static function build(array $sheets): string {
        $fonts = ['<font><sz val="10"/><name val="Arial"/></font>']; $fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
        $borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>', '<border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>'];
        $numFmts = ['#,##0.00' => 164, '@' => 49]; $xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']; $xfIndex = [];
        $reg = function (array $s) use (&$fonts, &$fills, &$borders, &$numFmts, &$xfs, &$xfIndex) {
            $key = json_encode($s); if (isset($xfIndex[$key])) return $xfIndex[$key]; if (!$s) return 0;
            $f = '<font>' . (!empty($s['bold']) ? '<b/>' : '') . (!empty($s['italic']) ? '<i/>' : '') . (!empty($s['underline']) ? '<u/>' : '') . '<sz val="' . ($s['size'] ?? 10) . '"/>' . (!empty($s['color']) ? '<color rgb="' . self::rgb($s['color']) . '"/>' : '') . '<name val="Arial"/></font>';
            $fi = array_search($f, $fonts, true); if ($fi === false) { $fonts[] = $f; $fi = count($fonts) - 1; }
            $fl = 0; if (!empty($s['bg'])) { $g = '<fill><patternFill patternType="solid"><fgColor rgb="' . self::rgb($s['bg']) . '"/><bgColor indexed="64"/></patternFill></fill>'; $fl = array_search($g, $fills, true); if ($fl === false) { $fills[] = $g; $fl = count($fills) - 1; } }
            $nf = !empty($s['format']) && isset($numFmts[$s['format']]) ? $numFmts[$s['format']] : 0;
            $al = '<alignment' . (!empty($s['align']) ? ' horizontal="' . $s['align'] . '"' : '') . ' vertical="' . (($s['valign'] ?? 'middle') === 'top' ? 'top' : 'center') . '"' . (!empty($s['wrap']) ? ' wrapText="1"' : '') . '/>';
            $xfs[] = '<xf numFmtId="' . $nf . '" fontId="' . $fi . '" fillId="' . $fl . '" borderId="' . (!empty($s['border']) ? 1 : 0) . '" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' . $al . '</xf>';
            return $xfIndex[$key] = count($xfs) - 1;
        };
        $sheetXml = []; $drawings = []; $media = [];
        foreach ($sheets as $si => $sh) {
            $rows = ''; $mr = $sh->maxRow(); $mc = max(1, $sh->maxCol());
            $rowKeys = array_unique(array_merge(array_keys($sh->cells), array_keys($sh->rowH))); sort($rowKeys);
            foreach ($rowKeys as $r) {
                $cs = '';
                $cols = array_keys($sh->cells[$r] ?? []); sort($cols);
                foreach ($cols as $c) {
                    $cell = $sh->cells[$r][$c]; $ref = self::col($c) . $r; $st = $reg($cell['s']); $sa = $st ? ' s="' . $st . '"' : ''; $v = $cell['v'];
                    if ($cell['f'] !== null) $cs .= '<c r="' . $ref . '"' . $sa . '><f>' . self::x($cell['f']) . '</f>' . ($v !== null && $v !== '' ? '<v>' . self::x($v) . '</v>' : '') . '</c>';
                    elseif ($v === null || $v === '') $cs .= '<c r="' . $ref . '"' . $sa . '/>';
                    elseif (is_int($v) || is_float($v)) $cs .= '<c r="' . $ref . '"' . $sa . '><v>' . $v . '</v></c>';
                    else $cs .= '<c r="' . $ref . '"' . $sa . ' t="inlineStr"><is><t xml:space="preserve">' . self::x($v) . '</t></is></c>';
                }
                $ht = isset($sh->rowH[$r]) ? ' ht="' . round($sh->rowH[$r] * 0.75, 2) . '" customHeight="1"' : '';
                $rows .= '<row r="' . $r . '"' . $ht . '>' . $cs . '</row>';
            }
            $colsXml = ''; foreach ($sh->colW as $c => $px) $colsXml .= '<col min="' . $c . '" max="' . $c . '" width="' . round(max(1, ($px - 5) / 7), 2) . '" customWidth="1"/>';
            $merge = ''; if ($sh->merges) { $merge = '<mergeCells count="' . count($sh->merges) . '">'; foreach ($sh->merges as [$r, $c, $nr, $nc]) $merge .= '<mergeCell ref="' . self::col($c) . $r . ':' . self::col($c + $nc - 1) . ($r + $nr - 1) . '"/>'; $merge .= '</mergeCells>'; }
            $views = '<sheetViews><sheetView workbookViewId="0"' . ($sh->gridlines ? '' : ' showGridLines="0"') . '>' . ($sh->frozenRows ? '<pane ySplit="' . $sh->frozenRows . '" topLeftCell="A' . ($sh->frozenRows + 1) . '" activePane="bottomLeft" state="frozen"/>' : '') . '</sheetView></sheetViews>';
            $draw = $sh->images ? '<drawing r:id="rId1"/>' : '';
            $sheetXml[$si] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' . $views . '<sheetFormatPr defaultRowHeight="15.75"/>' . ($colsXml ? '<cols>' . $colsXml . '</cols>' : '') . '<sheetData>' . $rows . '</sheetData>' . $merge . '<pageMargins left="0.4" right="0.4" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="' . ($sh->landscape ? 'landscape' : 'portrait') . '" fitToWidth="1" fitToHeight="0"/>' . $draw . '</worksheet>';
            if ($sh->images) {
                $d = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
                $rel = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
                foreach ($sh->images as $k => $im) {
                    $dim = @getimagesizefromstring($im['bytes']); $h = $im['h']; $w = $dim && $dim[1] ? (int)round($h * $dim[0] / $dim[1]) : $h;
                    $ext = $im['mime'] === 'image/png' ? 'png' : ($im['mime'] === 'image/gif' ? 'gif' : 'jpeg'); $mn = 'image' . (count($media) + 1) . '.' . $ext; $media[$mn] = $im['bytes'];
                    $d .= '<xdr:oneCellAnchor><xdr:from><xdr:col>' . ($im['c'] - 1) . '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' . ($im['r'] - 1) . '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="' . ($w * 9525) . '" cy="' . ($h * 9525) . '"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' . ($k + 2) . '" name="Image ' . ($k + 1) . '"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId' . ($k + 1) . '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' . ($w * 9525) . '" cy="' . ($h * 9525) . '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>';
                    $rel .= '<Relationship Id="rId' . ($k + 1) . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/' . $mn . '"/>';
                }
                $drawings[$si] = [$d . '</xdr:wsDr>', $rel . '</Relationships>'];
            }
        }
        $nf = '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>';
        $styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' . $nf . '<fonts count="' . count($fonts) . '">' . implode('', $fonts) . '</fonts><fills count="' . count($fills) . '">' . implode('', $fills) . '</fills><borders count="' . count($borders) . '">' . implode('', $borders) . '</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="' . count($xfs) . '">' . implode('', $xfs) . '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
        $ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
        $wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
        $wbrels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
        foreach ($sheets as $si => $sh) {
            $n = $si + 1; $name = preg_replace('/[\\\\\/?*\[\]:]/', '_', mb_substr($sh->name, 0, 31));
            $ct .= '<Override PartName="/xl/worksheets/sheet' . $n . '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
            if (isset($drawings[$si])) $ct .= '<Override PartName="/xl/drawings/drawing' . $n . '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
            $wb .= '<sheet name="' . self::x($name) . '" sheetId="' . $n . '" r:id="rId' . $n . '"/>';
            $wbrels .= '<Relationship Id="rId' . $n . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' . $n . '.xml"/>';
        }
        $wbrels .= '<Relationship Id="rId' . (count($sheets) + 1) . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
        $tmp = tempnam(sys_get_temp_dir(), 'xlsx'); $zip = new ZipArchive(); $zip->open($tmp, ZipArchive::OVERWRITE);
        $zip->addFromString('[Content_Types].xml', $ct . '</Types>');
        $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
        $zip->addFromString('xl/workbook.xml', $wb . '</sheets></workbook>'); $zip->addFromString('xl/_rels/workbook.xml.rels', $wbrels); $zip->addFromString('xl/styles.xml', $styles);
        foreach ($sheetXml as $si => $x) {
            $n = $si + 1; $zip->addFromString('xl/worksheets/sheet' . $n . '.xml', $x);
            if (isset($drawings[$si])) {
                $zip->addFromString('xl/drawings/drawing' . $n . '.xml', $drawings[$si][0]); $zip->addFromString('xl/drawings/_rels/drawing' . $n . '.xml.rels', $drawings[$si][1]);
                $zip->addFromString('xl/worksheets/_rels/sheet' . $n . '.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing' . $n . '.xml"/></Relationships>');
            }
        }
        foreach ($media as $mn => $b) $zip->addFromString('xl/media/' . $mn, $b);
        $zip->close(); $bytes = (string)file_get_contents($tmp); @unlink($tmp);
        return $bytes;
    }
}
