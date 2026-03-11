$path = 'c:\Users\segun\Desktop\payment_splitter\frontend\src\app\dashboard\page.tsx'
$content = Get-Content $path -Encoding Unicode
[System.IO.File]::WriteAllText($path, ($content -join "`r`n"), [System.Text.Encoding]::UTF8)
Write-Host "Converted $path to UTF-8"
