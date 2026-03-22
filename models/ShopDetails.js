import mongoose from "mongoose";

const ShopDetailsSchema = new mongoose.Schema({
    barber_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "Barber ID is required"],
        unique: true,
    },

    shop_name: {
        type: String,
        required: [true, "Shop name is required"],
        trim: true,
        maxLength: [100, "Shop name cannot exceed 100 characters"],
        index: true
    },

    profileUrl: {   
        public_id:  {
            type: String,
            default: ""
        },
        url: {
            type: String,
            required: true, 
        }
    },

    shop_address: {
        type: String,
        required: [true, "Shop address is required"],
        maxLength: [200, "Address cannot exceed 200 characters"],
    },

    phone: {
        type: String,
        required: [true, "Phone number is required"],
        validate: {
            validator: function(v) {
                return /^[0-9]{10}$/.test(v);
            },
            message: "Invalid phone number format"
        }
    },

    opening_hours: {
        start: {
            type: String,
            required: [true, "Opening time is required"],
            default: "09:00"
        },
        end: {
            type: String,
            required: [true, "Closing time is required"],
            default: "20:00"
        }
    },

    closing_days: [{
        type: String,
        enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    }],

    tiffin_time: {
        start: {
            type: String,
            default: "13:00"
        },
        end: {
            type: String,
            default: "14:00"
        }
    },

    today_open: {
        type: Boolean,
        default: true,
    },

    half_closing_day: {
        type: String,
        enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",""],
    },

    services: [{
        name: {
            type: String,
            required: [true, "Service name is required"],
        },
        duration: {
            type: Number, // in minutes
            required: [true, "Service duration is required"],
        },
        price: {
            type: Number,
            required: [true, "Service price is required"],
            min: [0, "Price cannot be negative"],
        },
        available: {
            type: Boolean,
            default: true,
        }
    }],

    slot_interval: {
        type: Number,
        default: 15, // 15-minute intervals
    },

    created_at: {
        type: Date,
        default: Date.now,
    },

    updated_at: {
        type: Date,
        default: Date.now,
    }
});

// Pre-save middleware
ShopDetailsSchema.pre('save', function(next) {
    this.updated_at = Date.now();
    next();
});

export default mongoose.model("ShopDetails", ShopDetailsSchema);