$filePath = 'c:\Users\segun\Desktop\payment_splitter\frontend\src\app\dashboard\page.tsx'
$content = Get-Content $filePath
$trimmed = $content[0..1918]
$trimmed | Set-Content $filePath -Encoding UTF8
Write-Host "Done. Lines: $($trimmed.Count)"
