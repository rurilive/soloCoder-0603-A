from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from ..database import get_db
from ..models import Agent

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentInfo(BaseModel):
    id: int
    name: str
    email: str
    department: Optional[str] = None
    avatar: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("", response_model=List[AgentInfo])
def list_agents(
    department: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Agent).filter(Agent.is_active == 1)
    if department:
        query = query.filter(Agent.department == department)
    agents = query.order_by(Agent.id).all()
    return agents


@router.get("/departments")
def list_departments(db: Session = Depends(get_db)):
    departments = db.query(Agent.department).filter(
        Agent.is_active == 1,
        Agent.department.isnot(None)
    ).distinct().all()
    return {
        "departments": [d[0] for d in departments]
    }


@router.get("/{agent_id}", response_model=AgentInfo)
def get_agent(agent_id: int, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent
