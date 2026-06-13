from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .api.users import router as users_router
from .api.events import router as events_router
from .api.registrations import router as registrations_router
from .api.devices import router as devices_router
from .api.reports import router as reports_router
from .scheduler import start_scheduler

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Event Management System", version="1.0.0")

scheduler = start_scheduler()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(events_router)
app.include_router(registrations_router)
app.include_router(devices_router)
app.include_router(reports_router)

@app.get("/")
def root():
    return {"message": "Welcome to Event Management System"}