import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    /* Name and price are copied, not joined: an order is a record of what was
       actually bought, and must not change when the catalogue does. */
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    qty: { type: Number, required: true, min: 1 },
    icon: { type: String, default: '' },
    image: { type: String, default: '' },
  },
  { _id: false },
);

const addressSchema = new mongoose.Schema(
  {
    name: String,
    phone: String,
    line: String,
    note: String,
  },
  { _id: false },
);

export const ORDER_FLOW = {
  pickup: ['ready', 'collected'],
  delivery: ['packing', 'out', 'delivered'],
};

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [itemSchema], required: true, validate: (v) => v.length > 0 },
    subtotal: { type: Number, required: true, min: 0 },
    fee: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    fulfilment: { type: String, enum: ['pickup', 'delivery'], required: true },
    address: { type: addressSchema, default: null },
    payment: { type: String, enum: ['cash', 'card'], default: 'cash' },
    /* Short human-readable code, also encoded into the pickup QR. */
    code: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ['ready', 'collected', 'packing', 'out', 'delivered', 'cancelled'],
      required: true,
      index: true,
    },
    withAppointment: { type: Boolean, default: false },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
    timeline: {
      type: [
        {
          status: String,
          at: { type: Date, default: Date.now },
          by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
          _id: false,
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

orderSchema.virtual('isOpen').get(function isOpen() {
  if (this.status === 'cancelled') return false;
  const flow = ORDER_FLOW[this.fulfilment] || [];
  return flow.indexOf(this.status) < flow.length - 1;
});

orderSchema.set('toJSON', { virtuals: true });

export const Order = mongoose.model('Order', orderSchema);
