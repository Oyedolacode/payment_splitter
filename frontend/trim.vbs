Set fso = CreateObject("Scripting.FileSystemObject")
inputFile = "c:\Users\segun\Desktop\payment_splitter\frontend\src\app\dashboard\page.tsx"
outputFile = "c:\Users\segun\Desktop\payment_splitter\frontend\src\app\dashboard\page.tsx.tmp"

Set inStream = fso.OpenTextFile(inputFile, 1, False, -1)
Set outStream = fso.OpenTextFile(outputFile, 2, True, -1)

lineNum = 0
Do While Not inStream.AtEndOfStream
    lineNum = lineNum + 1
    line = inStream.ReadLine
    If lineNum <= 1919 Then
        outStream.WriteLine line
    End If
Loop

inStream.Close
outStream.Close

fso.DeleteFile inputFile
fso.MoveFile outputFile, inputFile

WScript.Echo "Done. Trimmed to 1919 lines."
