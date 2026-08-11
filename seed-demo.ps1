$BASE = "https://lifeos-ii71.onrender.com"
$EMAIL = "demo@lifepulse.app"
$PASS  = "Demo@12345!"

$headers = @{ "Content-Type" = "application/json" }

# ── 1. Register (or login if already exists) ────────────────────────────────
Write-Host "Registering demo user..." -ForegroundColor Cyan
$body = @{ Email = $EMAIL; Password = $PASS } | ConvertTo-Json
try {
    $auth = Invoke-RestMethod -Uri "$BASE/api/auth/register" -Method Post -Body $body -Headers $headers
    Write-Host "   Registered!" -ForegroundColor Green
} catch {
    Write-Host "   Already exists, logging in..." -ForegroundColor Yellow
    $auth = Invoke-RestMethod -Uri "$BASE/api/auth/login" -Method Post -Body $body -Headers $headers
    Write-Host "   Logged in!" -ForegroundColor Green
}
$token = $auth.token
$authH = @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $token" }
Write-Host "   Token: $($token.Substring(0,20))..." -ForegroundColor DarkGray

# ── Helper ───────────────────────────────────────────────────────────────────
function Post($path, $data) {
    $json = $data | ConvertTo-Json -Depth 10
    try {
        Invoke-RestMethod -Uri "$BASE$path" -Method Post -Body $json -Headers $authH
    } catch {
        Write-Host "   ERROR on POST $path : $_" -ForegroundColor Red
        $null
    }
}
function Patch($path, $data) {
    $json = $data | ConvertTo-Json -Depth 10
    try {
        Invoke-RestMethod -Uri "$BASE$path" -Method Patch -Body $json -Headers $authH
    } catch {
        Write-Host "   ERROR on PATCH $path : $_" -ForegroundColor Red
    }
}

$now   = Get-Date
$today = $now.ToString("yyyy-MM-dd")

# ── 2. Folders ────────────────────────────────────────────────────────────────
Write-Host "Creating folders..." -ForegroundColor Cyan
$fWork     = Post "/api/folders" @{ Name = "Work";     Color = "#6366f1" }
$fPersonal = Post "/api/folders" @{ Name = "Personal"; Color = "#ec4899" }
$fHealth   = Post "/api/folders" @{ Name = "Health";   Color = "#22c55e" }
Write-Host "   Work: $($fWork.id)  Personal: $($fPersonal.id)  Health: $($fHealth.id)" -ForegroundColor Green

# ── 3. Tasks (POST then PATCH completed=true for done tasks) ──────────────────
Write-Host "Creating tasks..." -ForegroundColor Cyan
$due1 = $now.ToString("yyyy-MM-ddT09:00:00")
$due2 = $now.ToString("yyyy-MM-ddT17:00:00")
$due3 = $now.AddDays(2).ToString("yyyy-MM-ddT10:00:00")
$due4 = $now.AddDays(3).ToString("yyyy-MM-ddT14:00:00")
$due5 = $now.AddDays(-1).ToString("yyyy-MM-ddT12:00:00")   # overdue

$t1 = Post "/api/items" @{ Type="task"; Title="Review quarterly report";  Priority="high";   DueDate=$due1; FolderId=$fWork.id     }
$t2 = Post "/api/items" @{ Type="task"; Title="Team standup at 3 PM";     Priority="medium"; DueDate=$due2; FolderId=$fWork.id     }
$t3 = Post "/api/items" @{ Type="task"; Title="Redesign landing page";    Priority="high";   DueDate=$due3; FolderId=$fWork.id     }
$t4 = Post "/api/items" @{ Type="task"; Title="Buy birthday gift";        Priority="low";    DueDate=$due4; FolderId=$fPersonal.id }
$t5 = Post "/api/items" @{ Type="task"; Title="Submit freelance invoice"; Priority="high";   DueDate=$due5; FolderId=$fWork.id     }  # overdue
$t6 = Post "/api/items" @{ Type="task"; Title="Morning run 5km";          Priority="medium";               FolderId=$fHealth.id   }
$t7 = Post "/api/items" @{ Type="task"; Title="Update portfolio website"; Priority="medium"; DueDate=$due3; FolderId=$fWork.id     }

# Mark t6 (morning run) as completed
if ($t6 -and $t6.id) { Patch "/api/items/$($t6.id)" @{ Completed = $true } }
Write-Host "   Tasks created" -ForegroundColor Green

# ── 4. Calendar Events ────────────────────────────────────────────────────────
Write-Host "Creating events..." -ForegroundColor Cyan
Post "/api/items" @{ Type="event"; Title="Product design review";  EventDate=$now.ToString("yyyy-MM-ddT11:00:00");               FolderId=$fWork.id     }
Post "/api/items" @{ Type="event"; Title="Dentist appointment";    EventDate=$now.ToString("yyyy-MM-ddT15:30:00");               FolderId=$fHealth.id   }
Post "/api/items" @{ Type="event"; Title="Coffee with Sarah";      EventDate=$now.AddHours(2).ToString("yyyy-MM-ddTHH:mm:ss");  FolderId=$fPersonal.id }
Post "/api/items" @{ Type="event"; Title="Flight to Istanbul";     EventDate=$now.AddDays(7).ToString("yyyy-MM-ddT08:00:00");   FolderId=$fPersonal.id }
Post "/api/items" @{ Type="event"; Title="Team offsite";           EventDate=$now.AddDays(5).ToString("yyyy-MM-ddT09:00:00");   FolderId=$fWork.id     }
Write-Host "   Events created" -ForegroundColor Green

# ── 5. Sticky Notes ───────────────────────────────────────────────────────────
Write-Host "Creating sticky notes..." -ForegroundColor Cyan
$s1 = Post "/api/items" @{ Type="sticky"; Title="App idea";      Content="Voice-to-task: say 'remind me to...' and it auto-creates a task with AI";  Color="peach"; PosX=80;  PosY=120; Width=260; Height=180 }
$s2 = Post "/api/items" @{ Type="sticky"; Title="Q3 Goals";      Content="1. Launch v2.0`n2. Hit 1k users`n3. Write 4 blog posts";                    Color="sky";   PosX=380; PosY=80;  Width=240; Height=200 }
$s3 = Post "/api/items" @{ Type="sticky"; Title="Reading list";  Content="Atomic Habits - done`nDeep Work - reading now`nThe Lean Startup - up next"; Color="sage";  PosX=660; PosY=150; Width=250; Height=170 }
$s4 = Post "/api/items" @{ Type="sticky"; Title="Urgent!";       Content="Call the client before 5 PM - contract renewal discussion";                  Color="rose";  PosX=200; PosY=340; Width=240; Height=150 }
$s5 = Post "/api/items" @{ Type="sticky"; Title="Study vibes";   Content="Lofi Girl`nHans Zimmer OSTs`nJazz Cafe Radio";                              Color="lilac"; PosX=500; PosY=310; Width=220; Height=160 }

# Pin some notes
if ($s1 -and $s1.id) { Patch "/api/items/$($s1.id)" @{ Pinned = $true } }
if ($s4 -and $s4.id) { Patch "/api/items/$($s4.id)" @{ Pinned = $true } }
Write-Host "   Sticky notes created" -ForegroundColor Green

# ── 6. Notebook Pages ─────────────────────────────────────────────────────────
Write-Host "Creating notebook pages..." -ForegroundColor Cyan
Post "/api/items" @{
    Type="notebook_page"; Title="Project Kickoff Notes"; FolderId=$fWork.id
    Content="Meeting held on $today. Key decisions: redesign onboarding flow, prioritize mobile responsiveness, AI integration in v2.1. Action items: share Figma link, schedule user interviews, draft tech spec."
}
Post "/api/items" @{
    Type="notebook_page"; Title="Weekly Reflection"; FolderId=$fPersonal.id
    Content="What went well: shipped the notifications feature ahead of schedule. Great feedback from beta users on expense analytics. What to improve: need more consistent deep work blocks. Gratitude: amazing team and finally fixed that bug."
}
Post "/api/items" @{
    Type="notebook_page"; Title="Fitness Tracker"; FolderId=$fHealth.id
    Content="Mon: Run 5.2km. Tue: Rest. Wed: Gym 50min upper body. Thu: Run 6km - new PR! Fri: Yoga 30min. Monthly goal: 20 active days, currently at 14."
}
Write-Host "   Notebook pages created" -ForegroundColor Green

# ── 7. Expenses (PascalCase fields) ──────────────────────────────────────────
Write-Host "Creating expenses..." -ForegroundColor Cyan
Post "/api/expenses" @{ Amount=85;   Category="Food";          Note="Lunch at Tomoca Coffee";      Currency="Birr"; OccurredAt=$now.ToString("yyyy-MM-ddTHH:mm:ss") }
Post "/api/expenses" @{ Amount=320;  Category="Transport";     Note="Ride to airport and back";    Currency="Birr"; OccurredAt=$now.AddHours(-3).ToString("yyyy-MM-ddTHH:mm:ss") }
Post "/api/expenses" @{ Amount=150;  Category="Food";          Note="Groceries weekly shop";       Currency="Birr"; OccurredAt=$now.AddDays(-1).ToString("yyyy-MM-ddTHH:mm:ss") }
Post "/api/expenses" @{ Amount=500;  Category="Shopping";      Note="New headphones";              Currency="Birr"; OccurredAt=$now.AddDays(-1).AddHours(-5).ToString("yyyy-MM-ddTHH:mm:ss") }
Post "/api/expenses" @{ Amount=200;  Category="Entertainment"; Note="Cinema and popcorn";          Currency="Birr"; OccurredAt=$now.AddDays(-2).ToString("yyyy-MM-ddTHH:mm:ss") }
Post "/api/expenses" @{ Amount=80;   Category="Food";          Note="Breakfast with team";         Currency="Birr"; OccurredAt=$now.AddDays(-2).AddHours(-2).ToString("yyyy-MM-ddTHH:mm:ss") }
Post "/api/expenses" @{ Amount=1200; Category="Bills";         Note="Internet subscription";       Currency="Birr"; OccurredAt=$now.AddDays(-3).ToString("yyyy-MM-ddTHH:mm:ss") }
Post "/api/expenses" @{ Amount=600;  Category="Health";        Note="Pharmacy vitamins";           Currency="Birr"; OccurredAt=$now.AddDays(-4).ToString("yyyy-MM-ddTHH:mm:ss") }
Post "/api/expenses" @{ Amount=95;   Category="Food";          Note="Dinner at Yod Abyssinia";     Currency="Birr"; OccurredAt=$now.AddDays(-5).ToString("yyyy-MM-ddTHH:mm:ss") }
Post "/api/expenses" @{ Amount=400;  Category="Shopping";      Note="New running shoes";           Currency="Birr"; OccurredAt=$now.AddDays(-6).ToString("yyyy-MM-ddTHH:mm:ss") }
Post "/api/expenses" @{ Amount=250;  Category="Transport";     Note="Weekly Bolt rides";           Currency="Birr"; OccurredAt=$now.AddDays(-7).ToString("yyyy-MM-ddTHH:mm:ss") }
Post "/api/expenses" @{ Amount=180;  Category="Entertainment"; Note="Spotify and Netflix monthly"; Currency="Birr"; OccurredAt=$now.AddDays(-8).ToString("yyyy-MM-ddTHH:mm:ss") }
Write-Host "   Expenses created" -ForegroundColor Green

# ── 8. Planned purchases (wishlist) ──────────────────────────────────────────
Write-Host "Creating wishlist items..." -ForegroundColor Cyan
Post "/api/planned-purchases" @{ Name="MacBook Pro M4";       Amount=5500; Category="Shopping" }
Post "/api/planned-purchases" @{ Name="Mechanical keyboard";  Amount=800;  Category="Shopping" }
Post "/api/planned-purchases" @{ Name="Standing desk";        Amount=2200; Category="Shopping" }
Write-Host "   Wishlist created" -ForegroundColor Green

# ── 9. Notifications ─────────────────────────────────────────────────────────
Write-Host "Creating notifications..." -ForegroundColor Cyan
Post "/api/notifications" @{ Category="calendar"; Icon="d"; Title="Event coming up";   Body="Product design review starts in 45 min";                              Link="/calendar" }
Post "/api/notifications" @{ Category="task";     Icon="!"; Title="1 overdue task";    Body="Submit freelance invoice is past due";                                Link="/tasks"    }
Post "/api/notifications" @{ Category="expense";  Icon="$"; Title="Budget at 80%";     Body="You have used 81% of your monthly budget (3,060 / 3,800 Birr)";       Link="/expenses" }
Post "/api/notifications" @{ Category="task";     Icon="v"; Title="2 tasks due today"; Body="Review quarterly report, Team standup at 3 PM";                       Link="/tasks"    }
Write-Host "   Notifications created" -ForegroundColor Green

Write-Host ""
Write-Host "=================================================" -ForegroundColor Magenta
Write-Host "  All done! Demo data seeded successfully." -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Magenta
Write-Host "  Email:    $EMAIL" -ForegroundColor White
Write-Host "  Password: $PASS"  -ForegroundColor White
Write-Host "=================================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "Log in at your live URL and take screenshots!" -ForegroundColor Cyan
