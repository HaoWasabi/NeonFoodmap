from rest_framework import serializers

from .models import Invoice


class InvoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invoice
        fields = [
            'id',
            'reason',
            'amount',
            'status',
            'transaction_code',
            'paid_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'status',
            'transaction_code',
            'paid_at',
            'created_at',
            'updated_at',
        ]


class InvoiceCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invoice
        fields = ['amount']

    def create(self, validated_data):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        invoice = Invoice.objects.create(
            user=user if getattr(user, 'is_authenticated', False) else None,
            amount=validated_data['amount'],
            reason='Đặt món ăn',
        )
        return invoice
