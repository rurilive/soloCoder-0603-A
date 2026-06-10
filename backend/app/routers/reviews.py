from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime

from ..database import get_db
from ..models import Review, Order, Hotel
from ..schemas import Review as ReviewSchema, ReviewCreate, ReviewReply, ReviewStatusUpdate
from ..utils import filter_sensitive_words

router = APIRouter()

@router.post("/reviews", response_model=ReviewSchema)
def create_review(review: ReviewCreate, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == review.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order.status != "completed":
        raise HTTPException(status_code=400, detail="Only completed orders can be reviewed")
    
    existing_review = db.query(Review).filter(Review.order_id == review.order_id).first()
    if existing_review:
        raise HTTPException(status_code=400, detail="Review already exists for this order")
    
    if review.rating < 1 or review.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    
    filtered_comment = filter_sensitive_words(review.comment) if review.comment else None
    
    new_review = Review(
        order_id=review.order_id,
        hotel_id=order.hotel_id,
        rating=review.rating,
        comment=filtered_comment,
        status="pending"
    )
    
    db.add(new_review)
    db.commit()
    db.refresh(new_review)
    
    return new_review

@router.get("/reviews", response_model=List[ReviewSchema])
def get_reviews(
    db: Session = Depends(get_db),
    hotel_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1),
    limit: int = Query(10)
):
    query = db.query(Review)
    
    if hotel_id:
        query = query.filter(Review.hotel_id == hotel_id)
    if status:
        query = query.filter(Review.status == status)
    else:
        query = query.filter(Review.status == "approved")
    
    query = query.order_by(Review.created_at.desc())
    offset = (page - 1) * limit
    reviews = query.offset(offset).limit(limit).all()
    
    return reviews

@router.get("/reviews/pending", response_model=List[ReviewSchema])
def get_pending_reviews(
    db: Session = Depends(get_db),
    page: int = Query(1),
    limit: int = Query(10)
):
    query = db.query(Review).filter(Review.status == "pending")
    query = query.order_by(Review.created_at.desc())
    offset = (page - 1) * limit
    reviews = query.offset(offset).limit(limit).all()
    
    return reviews

@router.get("/reviews/{review_id}", response_model=ReviewSchema)
def get_review(review_id: int, db: Session = Depends(get_db)):
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    return review

@router.put("/reviews/{review_id}/status", response_model=ReviewSchema)
def update_review_status(review_id: int, update: ReviewStatusUpdate, db: Session = Depends(get_db)):
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    valid_statuses = ["pending", "approved", "rejected"]
    if update.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    review.status = update.status
    db.commit()
    db.refresh(review)
    
    return review

@router.put("/reviews/{review_id}/reply", response_model=ReviewSchema)
def reply_to_review(review_id: int, reply: ReviewReply, db: Session = Depends(get_db)):
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    if review.status != "approved":
        raise HTTPException(status_code=400, detail="Only approved reviews can be replied")
    
    filtered_reply = filter_sensitive_words(reply.reply)
    review.reply = filtered_reply
    review.reply_at = datetime.now()
    
    db.commit()
    db.refresh(review)
    
    return review

@router.delete("/reviews/{review_id}")
def delete_review(review_id: int, db: Session = Depends(get_db)):
    review = db.query(Review).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    
    db.delete(review)
    db.commit()
    
    return {"message": "Review deleted successfully"}

@router.get("/hotels/{hotel_id}/rating", response_model=dict)
def get_hotel_rating(hotel_id: int, db: Session = Depends(get_db)):
    hotel = db.query(Hotel).filter(Hotel.id == hotel_id).first()
    if not hotel:
        raise HTTPException(status_code=404, detail="Hotel not found")
    
    rating_data = db.query(
        func.avg(Review.rating).label('average_rating'),
        func.count(Review.id).label('review_count')
    ).filter(
        Review.hotel_id == hotel_id,
        Review.status == "approved"
    ).first()
    
    return {
        "hotel_id": hotel_id,
        "average_rating": round(rating_data.average_rating, 1) if rating_data.average_rating else None,
        "review_count": rating_data.review_count if rating_data.review_count else 0
    }