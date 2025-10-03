# Test script to diagnose RAGMaster server issues
Write-Host "=== RAGMaster Server Diagnostic ===" -ForegroundColor Cyan
Write-Host ""

# 1. Check if .env exists and has API key
Write-Host "1. Checking .env file..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Write-Host "   ✅ .env file exists" -ForegroundColor Green
    $envContent = Get-Content ".env" | Out-String
    if ($envContent -match "OPENAI_API_KEY=sk-") {
        $keyLength = ($envContent -match "OPENAI_API_KEY=(.+)" | Out-Null; $Matches[1].Trim().Length)
        Write-Host "   ✅ OPENAI_API_KEY found (length: $keyLength)" -ForegroundColor Green
    } else {
        Write-Host "   ❌ OPENAI_API_KEY not found or invalid" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "   ❌ .env file missing" -ForegroundColor Red
    exit 1
}

# 2. Check if node_modules exist
Write-Host ""
Write-Host "2. Checking dependencies..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Write-Host "   ✅ node_modules exists" -ForegroundColor Green
} else {
    Write-Host "   ❌ node_modules missing - run 'npm install'" -ForegroundColor Red
    exit 1
}

# 3. Check if frontend is built
Write-Host ""
Write-Host "3. Checking frontend build..." -ForegroundColor Yellow
if (Test-Path "frontend\dist") {
    Write-Host "   ✅ frontend/dist exists" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  frontend/dist missing - run 'npm run build'" -ForegroundColor Yellow
}

# 4. Kill existing node processes
Write-Host ""
Write-Host "4. Cleaning up existing Node processes..." -ForegroundColor Yellow
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Write-Host "   ✅ Cleaned up" -ForegroundColor Green

# 5. Start server
Write-Host ""
Write-Host "5. Starting server..." -ForegroundColor Yellow
Write-Host "   Press Ctrl+C to stop server" -ForegroundColor Cyan
Write-Host ""
npm start
