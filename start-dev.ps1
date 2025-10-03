# Start both backend and frontend in development mode
Write-Host "=== Starting RAGMaster Development Servers ===" -ForegroundColor Cyan
Write-Host ""

# Kill existing processes
Write-Host "Cleaning up existing processes..." -ForegroundColor Yellow
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Start backend in new window
Write-Host "Starting backend on port 3001..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; npm start"

# Wait a moment
Start-Sleep -Seconds 3

# Start frontend in new window  
Write-Host "Starting frontend on port 5174..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\frontend'; npm run dev"

Write-Host ""
Write-Host "✅ Both servers starting..." -ForegroundColor Green
Write-Host ""
Write-Host "Backend:  http://localhost:3001" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5174" -ForegroundColor Cyan
Write-Host ""
Write-Host "The Vite proxy will forward /api/* requests to the backend." -ForegroundColor Yellow
Write-Host "Press any key to stop both servers..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Kill both
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
Write-Host "Stopped all servers." -ForegroundColor Green
